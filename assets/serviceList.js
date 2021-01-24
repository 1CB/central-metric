window.serviceData = {};
window.activeRender = [];

window.viewAdditionalInfo = function (id) {
    document.getElementById("viewDetails").style.display = "block";
    document.getElementById("detailsID").innerText = id;
    document.getElementById("wDTitleID").innerText = id;
    document.getElementById("detailsRawData").value = JSON.stringify(JSON.parse(window.serviceData[id].extraData), null, 4);
}

function queueFS() { }

function renderServiceList() {
    /** @type {HTMLTableSectionElement} */
    let tableData = document.querySelector("table#serviceList > tbody");

    // Construct table data
    /** @type {Array<string>} */
    let ar = [...window.activeRender].filter((v, i, a) => !(a.indexOf(v, i + 1) + 1));
    let tdr = [];
    for (let id of ar) {
        let tr = document.createElement("tr");

        let trChild = [];
        for (let i = 0; i < 6; i++) trChild.push(document.createElement("td"));
        trChild.forEach((v, i) => v.classList.add(`column${i + 1}`));

        trChild[0].innerText = id;
        if (!window.serviceData.hasOwnProperty(id)) {
            queueFS(id);
            trChild[1].innerText = "";
            trChild[2].innerText = "";

            let u = trChild[3].appendChild(document.createElement("div"));
            u.innerText = "0%";
            u.style.backgroundColor = "red";
            u.style.color = "white";
            u.style.borderRadius = "6px";
            u.style.width = "fit-content";
            u.style.height = "fit-content";
            u.style.textShadow = "-1px 1px 0 #000, 1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000";
            u.style.paddingLeft = u.style.paddingRight =
                u.style.paddingTop = u.style.paddingBottom = "4px";

            trChild[4].innerText = "";
            trChild[5].innerHTML = "Not available";
        } else {
            trChild[1].innerText = window.serviceData[id].type;
            trChild[2].innerText = window.serviceData[id].version;
            let u = trChild[3].appendChild(document.createElement("div"));
            u.innerText = Math.round((window.serviceData[id].uptime > 1 ? 1 : window.serviceData[id].uptime) * 100) + "%";

            u.style.backgroundColor = (() => {
                switch (true) {
                    case window.serviceData[id].uptime >= 0.895:
                        return "green";
                    case window.serviceData[id].uptime >= 0.695:
                        return "yellow";
                    default:
                        return "red";
                }
            })();
            u.style.color = "white";
            u.style.borderRadius = "6px";
            u.style.width = "fit-content";
            u.style.height = "fit-content";
            u.style.textShadow = "-1px 1px 0 #000, 1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000";
            u.style.paddingLeft = u.style.paddingRight =
                u.style.paddingTop = u.style.paddingBottom = "4px";

            let f = new Date(window.serviceData[id].firstSeen);
            let p0 = (n, l = 2) => n.toString().padStart(l, "0");
            trChild[4].innerText = `${p0(f.getUTCFullYear(), 4)}/${p0(f.getUTCMonth() + 1)}/${p0(f.getUTCDate())} ${p0(f.getUTCHours())}:${p0(f.getUTCMinutes())}:${p0(f.getUTCSeconds())} GMT`;

            trChild[5].innerHTML = `<a href="javascript:void(viewAdditionalInfo('${id}'))">Info</a>`;
        }

        trChild.forEach(v => tr.appendChild(v));
        tdr.push(tr);
    }

    // Clear child in tbody
    [...tableData.children].forEach(v => tableData.removeChild(v));

    // Add new child
    tdr.forEach(v => tableData.appendChild(v));
}

async function registerActiveService(id) {
    if (window.ioSocket) {
        await window.ioSocket.sendAsyncACK({
            callEvent: "listenServiceChange",
            id
        });
        window.activeRender.push(id);
    }
}
function isActiveService(id) {
    return window.activeRender.includes(id);
}

async function initList() {
    /** @type {Array<{id: string}>} */
    let initialData = await window.ioSocket.sendAsyncACK({
        callEvent: "initialList"
    });

    for (let x of initialData) {
        window.serviceData[x.id] = x;
        await registerActiveService(x.id);
    }
    renderServiceList();
}

window.addEventListener("load", async () => {
    /** @type {HTMLSpanElement} */
    const STATUS = document.querySelector("span#status");

    let socket = io("wss://" + window.location.hostname + "/service_list");
    socket.sendAsyncACK = function (...d) {
        return new Promise(x => socket.send(...d, x));
    }
    window.ioSocket = socket;
    socket.once("connect", async () => {
        await initList();

        document.querySelector("div#loadingScreen").animate([
            {
                opacity: 1
            },
            {
                opacity: 0
            }
        ], 1500);
        document.body.style.overflow = "auto";
        await new Promise(x => setTimeout(x, 1499));
        document.querySelector("div#loadingScreen").style.display = "none";

        socket.on("connect", async () => {
            await initList();

            STATUS.innerHTML = "";
            STATUS.style.display = "none";
        })
    });
    socket.on("disconnect", () => {
        STATUS.innerHTML = "Connection lost!";
        STATUS.style.display = "inline";
        STATUS.style.color = "red";
    });

    socket.on("service_update", d => {
        window.serviceData[d.id] = d;
        if (isActiveService(d.id)) renderServiceList();
    });
});
