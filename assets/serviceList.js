window.addEventListener("load", async () => {
    /** @type {HTMLSpanElement} */
    const STATUS = document.querySelector("span#status");

    let socket = io("wss://" + window.location.hostname + "/service_list");
    socket.on("connect", () => {
        STATUS.innerHTML = "";
        STATUS.style.display = "none";
    })
    socket.once("connect", async () => {
        document.querySelector("div#loadingScreen").animate([
            {
                opacity: 1
            },
            {
                opacity: 0
            }
        ], 1000);
        await new Promise(x => setTimeout(x, 1000));
        document.body.style.overflow = "scroll";
        document.querySelector("div#loadingScreen").style.display = "none";
    });
    socket.on("disconnect", () => {
        STATUS.innerHTML = "Connection lost!";
        STATUS.style.display = "block";
    });


});
