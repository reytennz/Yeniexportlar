import os
import xml.etree.ElementTree as ET
import requests
from pathlib import Path
from typing import Optional, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import sys

URL_RAW = "luac.mtasa.com"
URL_FILE = f"https://{URL_RAW}/index.php"
MAX_WORKERS = 10
REQUEST_TIMEOUT = 90

SCRIPTS_TO_BUNDLE_FROM_DRP_SAC = [
    "client/core.lua",
    "client/debug_message.lua",
    "client/element_data.lua",
    "client/projectile.lua",
    "client/rapid_fire.lua",
]

def print_error(message: str):
    print(f"HATA: {message}", file=sys.stderr)

def print_warning(message: str):
    print(f"UYARI: {message}")

def read_lua_file(file_path: Path) -> Optional[str]:
    try:
        return file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        print_warning(f"'{file_path.name}' dosyası UTF-8 ile okunamadı, farklı bir kodlama denenecek.")
        try:
            from charset_normalizer import from_path
            result = from_path(file_path).best()
            if result:
                return str(result)
            raise ValueError("Kodlama tespit edilemedi.")
        except ImportError:
            print_error("charset_normalizer kütüphanesi bulunamadı. Lütfen yükleyin: pip install charset_normalizer")
            return None
        except Exception as e:
            print_error(f"'{file_path.name}' dosyası okunurken kodlama hatası: {e}")
            return None
    except IOError as e:
        print_error(f"'{file_path.name}' dosyası okunurken G/Ç hatası: {e}")
        return None

def gather_code_from_drp_sac(start_dir: Path) -> Tuple[Optional[str], float]:
    print("\n--- 'drp_sac' kaynağından kodlar toplanıyor... ---")

    drp_sac_path = None
    for potential_meta_path in start_dir.rglob("drp_sac/meta.xml"):
        if potential_meta_path.is_file():
            drp_sac_path = potential_meta_path.parent
            print(f"-> 'drp_sac' dizini bulundu: '{drp_sac_path}'")
            break

    if not drp_sac_path:
        print_warning("'drp_sac' dizini bulunamadı. Ekstra kod eklenmeyecek.")
        return None, 0

    temp_code_list = []
    latest_mtime = 0.0

    try:
        tree = ET.parse(drp_sac_path / "meta.xml")
        xml_root = tree.getroot()
    except ET.ParseError as e:
        print_error(f"'{drp_sac_path / 'meta.xml'}' okunurken XML hatası: {e}")
        return None, 0

    for script_tag in xml_root.findall("script"):
        src = script_tag.get("src", "").replace(".lua", ".lua").replace("\\", "/")
        script_type = script_tag.get("type")

        if src and script_type in ["client", "shared"] and src in SCRIPTS_TO_BUNDLE_FROM_DRP_SAC:
            lua_path_full = drp_sac_path / src
            if lua_path_full.exists():
                content = read_lua_file(lua_path_full)
                if content:
                    print(f"   Okunuyor (LİSTEYLE EŞLEŞTİ): '{lua_path_full.name}'")
                    temp_code_list.append(f"\n-- Bundled from drp_sac: {src} (type: {script_type})\n")
                    temp_code_list.append(content)

                    latest_mtime = max(latest_mtime, lua_path_full.stat().st_mtime)
            else:
                print_warning(f"'{lua_path_full.name}' dosyası diskte bulunamadı, atlanıyor.")
        elif src:
            print(f"   Atlanıyor (listede değil veya tip uyumsuz): '{src}'")

    if not temp_code_list:
        return None, 0

    bundled_code = "\n".join(temp_code_list)
    return bundled_code, latest_mtime

def compile_single_file(lua_path: Path, drp_sac_code_to_inject: Optional[str] = None) -> bool:
    print(f"Derleme isteği gönderiliyor: '{lua_path.name}'")
    file_content = read_lua_file(lua_path)
    if file_content is None:
        return False

    if lua_path.name == "bundle.lua" and drp_sac_code_to_inject:
        print(f"-> '{lua_path.name}' dosyasına 'drp_sac' kodu ekleniyor.")
        file_content += (
            "\n\nif localPlayer then\n"
            + drp_sac_code_to_inject
            + "\nend\n"
        )

    payload_data = {
        "compile": "1",
        "obfuscate": "3",
        "debug": "0",
        "Submit": "Submit",
    }
    
    file_to_upload = {
        "luasource": (lua_path.name, file_content.encode("utf-8"), "application/octet-stream")
    }

    try:
        response = requests.post(URL_FILE, data=payload_data, files=file_to_upload, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()

        if response.content == b"ERROR Could not compile file":
            print_error(f"Sunucu '{lua_path.name}' dosyasını derleyemedi.")
            return False

        luac_path = lua_path.with_suffix(".lua")
        try:
            luac_path.write_bytes(response.content)
            return True
        except IOError as e:
            print_error(f"'{luac_path.name}' dosyası yazılamadı: {e}")
            return False

    except requests.exceptions.Timeout:
        print_error(f"'{lua_path.name}' derlenirken zaman aşımı oluştu.")
        return False
    except requests.exceptions.ConnectionError as e:
        print_error(f"'{lua_path.name}' derlenirken ağ bağlantı hatası: {e}")
        return False
    except requests.exceptions.HTTPError as e:
        print_error(f"'{lua_path.name}' derlenirken HTTP hatası: {e.response.status_code} - {e.response.text.strip()}")
        return False
    except Exception as e:
        print_error(f"'{lua_path.name}' işlenirken beklenmedik hata: {e}")
        return False

def main():
    start_time = time.time()
    start_directory = Path("./")

    drp_sac_bundled_code, drp_sac_latest_mtime = gather_code_from_drp_sac(start_directory)

    print("\n--- Derlenecek dosyalar taranıyor... ---")
    tasks_to_compile: List[Tuple[Path, bool]] = []

    for meta_path in start_directory.rglob("meta.xml"):
        print(f"\nMeta dosyası işleniyor: '{meta_path}'")
        project_dir = meta_path.parent
        
        try:
            tree = ET.parse(meta_path)
            root = tree.getroot()
        except ET.ParseError as e:
            print_error(f"'{meta_path}' okunurken XML ayrıştırma hatası: {e}")
            continue
        except FileNotFoundError:
            print_error(f"'{meta_path}' bulunamadı, atlanıyor.")
            continue

        for script_tag in root.findall("script"):
            src = script_tag.get("src")
            script_type = script_tag.get("type")

            if src and src.endswith(".lua") and script_type in ["client", "shared"]:
                lua_path = (project_dir / src).with_suffix(".lua")
                luac_path = project_dir / src

                if lua_path.exists():
                    try:
                        lua_mtime = lua_path.stat().st_mtime
                        luac_mtime = luac_path.stat().st_mtime if luac_path.exists() else 0
                        
                        is_bundle_file = lua_path.name == "bundle.lua"
                        force_recompile = (
                            is_bundle_file 
                            and drp_sac_bundled_code is not None 
                            and drp_sac_latest_mtime > luac_mtime
                        )

                        if lua_mtime > luac_mtime or force_recompile:
                            reason = "kaynak dosya daha yeni olduğu için"
                            if force_recompile and not (lua_mtime > luac_mtime):
                                reason = "'drp_sac' kodu ekleneceği için yeniden derleniyor"
                            
                            print(f"-> Derleme listesine eklendi: '{lua_path.name}' ({reason})")
                            tasks_to_compile.append((lua_path, is_bundle_file))
                        else:
                            print(f"-> Atlanıyor: '{lua_path.name}' (derlenmiş hali güncel)")
                    except Exception as e:
                        print_error(f"'{lua_path.name}' işlenirken zaman damgası hatası: {e}")
                else:
                    print_warning(f"Meta dosyasında '{src}' belirtilmiş ancak kaynak dosya ('{lua_path.name}') bulunamadı. Atlanıyor.")
            elif src and src.endswith(".lua"):
                print(f"-> Atlanıyor: '{src}' (desteklenmeyen betik tipi: '{script_type}')")


    if not tasks_to_compile:
        print("\n--- Derlenecek yeni veya değiştirilmiş dosya bulunamadı. ---")
        return

    print(f"\n--- Toplam {len(tasks_to_compile)} dosya eş zamanlı olarak derlenecek... ---")
    
    successful_compiles = 0
    failed_compiles = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_path = {
            executor.submit(
                compile_single_file,
                lua_path,
                drp_sac_bundled_code if needs_bundle_code_injection else None
            ): lua_path
            for lua_path, needs_bundle_code_injection in tasks_to_compile
        }

        for future in as_completed(future_to_path):
            path = future_to_path[future]
            try:
                if future.result():
                    print(f"BAŞARILI: '{path.name}' -> '{path.with_suffix('.lua').name}'")
                    successful_compiles += 1
                else:
                    failed_compiles += 1
            except Exception as exc:
                print_error(f"'{path.name}' derlenirken beklenmeyen bir istisna oluştu: {exc}")
                failed_compiles += 1
    
    end_time = time.time()
    print("\n" + "="*30)
    print("--- İşlem Tamamlandı ---")
    print(f"Toplam Süre: {end_time - start_time:.2f} saniye")
    print(f"Başarılı Derlemeler: {successful_compiles}")
    print(f"Hatalı Derlemeler: {failed_compiles}")
    print("="*30)


if __name__ == "__main__":
    main()
