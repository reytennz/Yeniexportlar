const keyCodes = {
    enter: 13,
    tab: 9,
    arrowUp: 38,
    arrowDown: 40,
};

const comms = [];

const state = {
    scroll: false,
    canScrollToBottom: true,
    lastRegisteredDelayCallback: null,
};

let eventNames = [];

let aCommands = false;

const hexRegex = /#[0-9A-F]{6}/gi;

let elements;

function setEventHashes(hashes) {
    eventNames = hashes;
}

function setAutoCompleteCommands(commands) {
    for (let i = 0; i < commands.length; i++) {
        const { commandName, params = "..." } = commands[i];

        comms.push([
            commandName,
            `<span class=param>[${params}]</span>`,
            "false",
        ]);
    }

    autocomplete(comms);
}

function show(bool) {
    if (!bool) return elements.chat.classList.add("hidden");
    elements.chat.classList.remove("hidden");

    if (bool) {
        elements.input.addEventListener("keydown", preventPressTab);
    } else {
        elements.input.removeEventListener("keydown", preventPressTab);
    }

    scrollToBottom();
}

let preserveActive = true;
let preserveInputText = "";

function showInput(definition) {
    if (preserveInputText == "") {
        elements.input.value = "";
    } else {
        if (preserveActive) {
            elements.input.value = preserveInputText;
        } else {
            elements.input.value = "";
        }
    }

    elements.inputLabel.innerText = definition;

    elements.inputBlock.classList.remove("hidden");

    elements.input.style.paddingLeft = `${
        elements.inputLabel.offsetWidth + 10
    }px`;

    setTimeout(() => {
        elements.input.focus();
        document.addEventListener("keydown", onKeydownEnterButton);
        document.addEventListener("click", onBlur);
    }, 0);
}

function setPreserveText(value) {
    if (value == "true") {
        preserveActive = true;
    } else {
        preserveActive = false;
    }
}

function saveInputField() {
    preserveInputText = elements.input.value;
}

function clearInputField() {
    preserveInputText = "";
}

function hideInput() {
    elements.inputBlock.classList.add("hidden");
    elements.input.blur();
    document.removeEventListener("keydown", onKeydownEnterButton);
    document.removeEventListener("click", onBlur);
}

function addMessage(message) {
    if (
        document.querySelector(".chat__messages-container").childElementCount >
        75
    ) {
        document
            .querySelector(".chat__messages-container")
            .firstElementChild.remove();
    }
    render(message);
    scrollToBottom();
}

function applyChatFontSize(size) {
    elements.chatMessages.style.fontSize = size + "px";
    elements.chatMessages.style.lineHeight = size + 2 + "px";
    scrollToBottom();
}

function changeBackground(color) {
    elements.chatMessages.style.backgroundColor = color;
}

function setChatHeight(height) {
    elements.chatMessages.style.height = height + "px";

    let inputPos = height;
    elements.inputBlock.style.top = inputPos + "px";
    elements.inputBlock.style.marginTop = "37px";
    scrollToBottom();
}

function setACommands(status) {
    aCommands = JSON.parse(status);
}

function setFontHeight(height) {
    let lh = parseInt(height) + 2;
    elements.chatMessages.style.fontSize = height + "px";
    elements.chatMessages.style.lineHeight = lh + "px";
}

function changeFont(font) {
    if (font == "Tahoma-Bold") {
        elements.chatMessages.style.fontWeight = 850;
        elements.chatMessages.style.fontFamily = "Tahoma";
    } else {
        elements.chatMessages.style.fontWeight = 400;
        elements.chatMessages.style.fontFamily = font;
    }
}

function addMessages([messages]) {
    for (let i = 0; i < messages.length; i++) {
        render(messages[i]);
    }
    scrollToBottom();
}

function scrollToBottom(force = false) {
    if (force) {
        state.canScrollToBottom = true;
        state.lastRegisteredDelayCallback = null;
    }

    if (!state.canScrollToBottom) return;

    elements.chatMessages.scrollTo({
        top: elements.chatMessages.scrollHeight,
        behavior: "smooth",
    });
}

function preventPressTab(e) {
    if (e.keyCode == keyCodes.arrowUp) {
        e.preventDefault();
        let text = removeHex(elements.input.value);
        mta.triggerEvent(eventNames.onSelectHistory, text, 1);
    }
    if (e.keyCode == keyCodes.arrowDown) {
        e.preventDefault();
        let text = removeHex(elements.input.value);
        mta.triggerEvent(eventNames.onSelectHistory, text, -1);
    }
    if (e.keyCode == keyCodes.tab) {
        e.preventDefault();
        let text = removeHex(elements.input.value);
        mta.triggerEvent(
            "onClientChatBoxInputAutoCompletion",
            text,
            elements.input.selectionStart
        );
    }
}

function correctText(string) {
    if (string) {
        elements.input.value = string;
    }

    let text = removeHex(elements.input.value);
    elements.input.value = text;
}

function setText(text) {
    correctText(text);
}

function removeHex(value) {
    var c = value;
    c = c.replace(
        /#([0-9A-F][0-9A-F])([0-9A-F][0-9A-F])([0-9A-F][0-9A-F])/gi,
        ""
    );
    return c;
}

function render(message) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("chat__message");
    const messageFragment = document.createDocumentFragment();

    const processedText = processTextWithHexCode(message);
    for (let index = 0; index < processedText.length; index++) {
        const { text, color } = processedText[index];

        const partElement = document.createElement("span");
        partElement.innerText = text;
        partElement.style.color = color;
        messageFragment.appendChild(partElement);
    }

    messageElement.append(messageFragment);
    elements.chatMessagesContainer.append(messageElement);
}

function scroll(definition) {
    if (!state.scroll) return;
    const maxSpeed = 50;
    const acceleration = 2;
    const value = definition == "scrollup" ? -15 : 15;

    const scrollContainer = elements.chatMessages;
    const currentScrollTop = scrollContainer.scrollTop;
    const targetScrollTop =
        definition == "scrollup"
            ? currentScrollTop - value
            : currentScrollTop + value;

    const scrollStep = Math.abs(targetScrollTop - currentScrollTop);
    const adjustedScrollStep = Math.min(maxSpeed, scrollStep * acceleration);

    if (definition == "scrollup") {
        scrollContainer.scrollTop -= adjustedScrollStep;
    } else {
        scrollContainer.scrollTop += adjustedScrollStep;
    }

    if (scrollStep > 0) {
        requestAnimationFrame(() => scroll(definition));
    } else {
        state.canScrollToBottom = true;
        state.lastRegisteredDelayCallback = null;
    }
}

function clear() {
    elements.chatMessagesContainer.innerHTML = "";
}

function processTextWithHexCode(text) {
    const results = [];
    const hexCodes = text.match(hexRegex);
    const parts = text.split(hexRegex);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "") continue;
        results.push({ text: part, color: i === 0 ? null : hexCodes[i - 1] });
    }

    return results;
}

function registerDelayCallback() {
    state.canScrollToBottom = false;

    let callback = function () {
        if (!state.lastRegisteredDelayCallback) return;

        if (callback.uniqueId !== state.lastRegisteredDelayCallback.uniqueId) {
            return;
        }

        state.canScrollToBottom = true;
        scrollToBottom();
        state.lastRegisteredDelayCallback = null;
    };
    callback.uniqueId = Date.now();

    state.lastRegisteredDelayCallback = callback;
    setTimeout(callback, 5000);
}

function onKeydownEnterButton(ev) {
    if (ev.keyCode !== keyCodes.enter) return;

    mta.triggerEvent(
        eventNames.onKeyEnter,
        elements.inputLabel.innerText,
        elements.input.value
    );
    scrollToBottom(true);
}

window.onkeydown = function (e) {
    return !(e.keyCode == 32 && e.target == document.body);
};

function onChangeInputBox() {
    let text = removeHex(elements.input.value);
    mta.triggerEvent("onClientChatBoxInputChange", text);
}

function startScroll(definition) {
    state.scroll = true;
    scroll(definition);
}

function onBlur() {
    elements.input.focus();
}

function stopScroll() {
    state.scroll = false;

    const isEndOfScroll =
        elements.chatMessages.scrollHeight -
            elements.chatMessages.scrollTop -
            parseInt(getComputedStyle(elements.chatMessages).height) <=
        1;

    if (isEndOfScroll) {
        state.canScrollToBottom = true;
        state.lastRegisteredDelayCallback = null;
        return;
    }

    registerDelayCallback();
}

function onDOMContentLoaded() {
    elements = {
        chat: document.querySelector(".chat"),
        inputBlock: document.querySelector(".chat__input-block"),
        inputLabel: document.querySelector(".chat__input-label"),
        inputCounter: document.querySelector(".input_counter"),
        param: document.querySelector(".param"),
        paramo: document.querySelector(".paramo"),
        input: document.querySelector(".chat__input"),
        chatMessages: document.querySelector(".chat__messages"),
        chatMessagesContainer: document.querySelector(
            ".chat__messages-container"
        ),
    };
    document.addEventListener("keydown", blockScrollUpButton);
    mta.triggerEvent("6fb65196f4cd9a49");
}

var blockScrollUpButton = function (e) {
    if (e.keyCode == 36) {
        e.preventDefault();
    }
};

document.addEventListener("DOMContentLoaded", onDOMContentLoaded);

function textCounter(field, field2, maxlimit) {
    var countfield = document.getElementById(field2);

    if (field.value.length > maxlimit) {
        field.value = field.value.substring(0, maxlimit);
        return false;
    } else {
        countfield.value = field.value.length + "/200";
    }
}

const color = "#000";
const r = 1;
const n = Math.ceil(2 * Math.PI * r);
var str = "";
for (var i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n;
    str +=
        r * Math.cos(theta) +
        "px " +
        r * Math.sin(theta) +
        "px 0 " +
        color +
        (i == n - 1 ? "" : ",");
}
document.querySelector(".chat__messages").style.textShadow = str;

var found = 0;

function autocomplete(arr) {
    const inp = document.getElementById("commands");

    arr = arr.sort(function (a, b) {
        return a[0].length - b[0].length || a[0].localeCompare(b);
    });

    var currentFocus;
    var played = false;

    function onKeydownEnterButton(ev) {
        if (ev.keyCode !== 13) return;
        closeAllLists();
        played = false;
    }

    inp.addEventListener("input", function (e) {
        var a,
            b,
            i,
            val = this.value;
        if (val.length < 2) {
            closeAllLists();
            played = false;
            return false;
        }
        closeAllLists();
        if (!val) {
            return false;
        }
        document.addEventListener("keydown", onKeydownEnterButton);
        currentFocus = -1;

        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");

        this.parentNode.appendChild(a);

        for (i = 0; i < arr.length; i++) {
            if (found < 6) {
                var search = val.split(" ");
                if (
                    arr[i][0].substr(0, val.length).toUpperCase() ==
                    search[0].toUpperCase()
                ) {
                    if (aCommands == false && arr[i][2] == "true") {
                        continue;
                    }
                    found = found + 1;
                    b = document.createElement("DIV");
                    b.classList.add("eachItem");

                    if (arr[i][0].length - 1 >= search[0].length) {
                        b.innerHTML =
                            "<strong>" +
                            arr[i][0].substr(0, val.length) +
                            "</strong>";
                        b.innerHTML +=
                            arr[i][0].substr(val.length).replace(" ", "") + " ";
                        b.innerHTML += arr[i][1];
                    } else if (arr[i][0].length - 1 < search[0].length) {
                        b.innerHTML = "<strong>" + arr[i][0] + "</strong> ";
                        b.innerHTML += arr[i][1];
                    }
                    b.innerHTML +=
                        "<input type='hidden' value='" + arr[i] + "'>";
                    b.addEventListener("click", function (e) {
                        closeAllLists();
                    });
                    if (played == false) {
                        a.classList.add("fade-in");
                        played = true;
                    }

                    a.appendChild(b);
                }
            }
        }
    });

    inp.addEventListener("keydown", function (e) {
        found = 0;
        var x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) {
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) {
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) {
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = x.length - 1;
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}
