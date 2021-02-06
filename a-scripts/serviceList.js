window.serviceData = {};
window.activeRender = [];
window.SBCData = new Map();

async function updateStats() {
    if (window.ioSocket && window.ioSocket.connected) {
        let d = await window.ioSocket.sendAsyncACK({
            callEvent: "stats"
        });

        document.getElementById("statActiveCount").innerText = `${d.activeService}/${d.registered}`;
        
        let u = document.createElement("div");
        u.style.display = "inline-block";
        u.innerText = Math.round((d.avgUptime > 1 ? 1 : d.avgUptime) * 100) + "%";

        u.style.backgroundColor = (() => {
            switch (true) {
                case d.avgUptime >= 0.795:
                    return "green";
                case d.avgUptime >= 0.645:
                    return "yellow";
                default:
                    return "red";
            }
        })();

        u.style.backgroundColor = "red";
        u.style.color = "white";
        u.style.borderRadius = "6px";
        u.style.width = "fit-content";
        u.style.height = "fit-content";
        u.style.textShadow = "-1px 1px 0 #000, 1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000";
        u.style.paddingLeft = u.style.paddingRight =
            u.style.paddingTop = u.style.paddingBottom = "4px";

        const AVGUPTIME = document.getElementById("statAvgUptime");
        AVGUPTIME.innerHTML = "";
        AVGUPTIME.appendChild(u);

        let random = (start, end) => Math.floor(Math.random() * (end - start)) + start;

        for (let v of window.SBCData.keys()) {
            if (!d.countType[v]) window.SBCData.remove(v);
        }

        for (let k in d.countType) {
            if (d.countType[k].active !== 0)
                window.SBCData.set(k, {
                    count: d.countType[k].active,
                    color: (window.SBCData.get(k) || {}).color || 
                        `${random(127, 200)}, ${random(127, 200)}, ${random(127, 200)}`
                });
        }

        window.SBCChart.data = {
            labels: [...window.SBCData.keys()],
            datasets: [{
                data: [...window.SBCData.values()].map(x => x.count),
                backgroundColor: [...window.SBCData.values()].map(x => `rbga(${x.color}, 0.5)`),
                hoverBackgroundColor: [...window.SBCData.values()].map(x => `rbga(${x.color}, 1)`),
                borderColor: [...window.SBCData.values()].map(x => `rbga(${x.color}, 1)`),
                borderWidth: 1
            }]
        }

        window.SBCChart.update();
    }
}

window.viewAdditionalInfo = function (id) {
    let extraData = JSON.parse((window.serviceData[id] || {}).extraData || "{}");
    document.getElementById("viewDetails").style.display = "block";
    document.getElementById("detailsID").innerText = id;
    document.getElementById("wDTitleID").innerText = id;
    document.getElementById("detailsRawData").value = JSON.stringify(extraData, null, 4);
    document.getElementById("detailsDesc").value = extraData.description;
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
async function deregisterActiveService(id) {
    if (isActiveService(id)) {
        if (window.ioSocket) {
            await window.ioSocket.sendAsyncACK({
                callEvent: "stopListenServiceChange",
                id
            });
            window.activeRender.splice(window.activeRender.indexOf(id), 1);
        }
    }
}

function isActiveService(id) {
    return window.activeRender.includes(id);
}

async function initList() {
    try {
        clearInterval(window.statUpdateClock);
    } catch (_) {}
    window.statUpdateClock = setInterval(updateStats, 60000);
    await updateStats();

    await Promise.all(window.activeRender.map(deregisterActiveService));

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

        STATUS.innerHTML = "";
        STATUS.style.display = "none";
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

    window.SBCChart = new Chart(document.getElementById('SBCCanvas').getContext('2d'), {
        type: 'pie',
        data: {
            labels: [...window.SBCData.keys()],
            datasets: [{
                data: [...window.SBCData.values()].map(x => x.count),
                backgroundColor: [...window.SBCData.values()].map(x => `rbga(${x.color}, 0.5)`),
                hoverBackgroundColor: [...window.SBCData.values()].map(x => `rbga(${x.color}, 1)`),
                borderColor: [...window.SBCData.values()].map(x => `rbga(${x.color}, 1)`),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1
        }
    });
});
