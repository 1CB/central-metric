process.stderr.write = process.stdout.write.bind(process.stdout);

function validJSONObject(json) {
    try {
        let val = JSON.parse(json);
        if (typeof val !== "object") return false;
        return true;
    } catch (_) {
        return false;
    }
}

function uintToInt(bytes4) {
    return bytes4 > 2 ** 31 - 1 ? bytes4 - 2 ** 32 : bytes4;
}

function intToUInt(bytes4) {
    return bytes4 < 0 ? bytes4 + 2 ** 32 : bytes4;
}

(async () => {
    require("dotenv").config();

    let express = require("express");
    let app = express();
    let http = require("http");

    app.use("/assets", express.static("./assets"));
    app.use("/", express.static("./views"));

    let server = http.createServer(app);

    let Sequelize = require('sequelize');
    let sequelize = new Sequelize.Sequelize(
        ...(
            process.env.FORCE_DATABASE_URL ?? process.env.DATABASE_URL ?
                [process.env.FORCE_DATABASE_URL ?? process.env.DATABASE_URL, {
                    dialectOptions: JSON.parse(process.env.FORCE_SQL_OPTIONS ?? process.env.SQL_OPTIONS ?? "null")
                }] :
                [
                    process.env.SQL_DATABASE,
                    process.env.SQL_USERNAME,
                    process.env.SQL_PASSWORD,
                    {
                        host: process.env.SQL_SERVER,
                        dialect: process.env.SQL_MODE,
                        pool: {
                            max: 5,
                            min: 0,
                            idle: 10000
                        },
                        storage: process.env.SQL_FILE
                    }
                ]
        )
    );

    let BotList = sequelize.define('slist', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        secret: Sequelize.INTEGER,
        uptime: Sequelize.TEXT,
        uptimeResolved: Sequelize.DOUBLE,
        type: Sequelize.STRING,
        version: Sequelize.STRING,
        firstSeen: Sequelize.DATE,
        validPingUntil: Sequelize.DATE,
        extraData: Sequelize.TEXT
    });

    await sequelize.sync();

    let wsio = require("socket.io");
    let APIWS = new wsio.Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    let APIWS_PING = APIWS.of("/service_ping");
    let APIWS_DATA = APIWS.of("/service_list");

    APIWS_DATA.on(
        "connection",
        /**
         * @param {wsio.Socket} socket Socket
         */
        socket => {
            socket.on("message", async (msg, ack) => {
                console.log(`LISTAPI / ${socket.id}:`, JSON.stringify(msg));

                if (typeof msg !== "object") {
                    return ack({
                        error: "Invalid API call.",
                        errorDesc: "Message must be an object.",
                        errorCode: -1
                    });
                }

                switch (msg.callEvent) {
                    case "initialList":
                        let d = await BotList.findAll({
                            limit: 20,
                            order: [
                                ['uptimeResolved', 'DESC'],
                                ['firstSeen', 'ASC']
                            ],
                            where: {
                                validPingUntil: {
                                    [Sequelize.Op.gt]: new Date()
                                }
                            }
                        });
                        return ack(d.map(v => v.get()).map(v => ({
                            id: intToUInt(v.id).toString(16).padStart(8, "0"),
                            extraData: v.extraData,
                            uptime: v.uptimeResolved,
                            type: v.type,
                            version: v.version,
                            firstSeen: v.firstSeen,
                            validPingUntil: v.validPingUntil
                        })));
                    case "listenServiceChange":
                        if (typeof msg.id !== "string" || isNaN(parseInt(msg.id))) return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.id must be a valid ID string.",
                            errorCode: 101
                        });
                        await socket.join("s_" + msg.id);
                        return ack({ success: true });
                    case "stopListenServiceChange":
                        if (typeof msg.id !== "string" || isNaN(parseInt(msg.id))) return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.id must be a valid ID string.",
                            errorCode: 101
                        });
                        await socket.leave("s_" + msg.id);
                        return ack({ success: true });
                }
            });
        }
    )

    APIWS_PING.on(
        "connection",
        /**
         * @param {wsio.Socket} socket Socket
         */
        socket => {
            socket.on("message", async (msg, ack) => {
                console.log(`PINGAPI / ${socket.id}:`, JSON.stringify(msg));

                if (typeof msg !== "object") {
                    return ack({
                        error: "Invalid API call.",
                        errorDesc: "Message must be an object.",
                        errorCode: -1
                    });
                }

                switch (msg.callEvent) {
                    case "register":
                        if (typeof msg.type !== "string") return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.type must be bot type (string)",
                            errorCode: 1
                        });
                        if (typeof msg.version !== "string") return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.version must be version (string)",
                            errorCode: 2
                        });
                        if (typeof msg.extraData !== "string" || !validJSONObject(msg.extraData)) return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.extraData must be JSON containing bot information (string)",
                            errorCode: 3
                        });

                        for (; ;) {
                            let RNG = Math.floor(Math.random() * 2 ** 32);
                            let RNGSecret = Math.floor(Math.random() * 2 ** 32);
                            let CC = await BotList.findOne({
                                where: {
                                    id: uintToInt(RNG),
                                    secret: uintToInt(RNGSecret)
                                }
                            });

                            if (!CC) {
                                await BotList.create({
                                    id: uintToInt(RNG),
                                    secret: uintToInt(RNGSecret),
                                    uptime: "[]",
                                    uptimeResolved: 1,
                                    version: msg.version,
                                    firstSeen: new Date(),
                                    // A ping is only valid in 45 seconds
                                    validPingUntil: new Date(Date.now() + 45000),
                                    type: msg.type,
                                    extraData: msg.extraData
                                });

                                // TODO: return
                                return ack({
                                    nonce: msg.nonce,
                                    id: RNG.toString(16).padStart(8, "0"),
                                    secret: RNGSecret.toString(16).padStart(8, "0")
                                });
                            }
                        }
                    case "ping":
                        if (typeof msg.id !== "string") return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.id must be a vaild ID (string)",
                            errorCode: 4
                        });
                        if (typeof msg.secret !== "string") return ack({
                            error: "Invalid API call.",
                            errorDesc: "message.secret must be a vaild secret for ID (string)",
                            errorCode: 5
                        });
                        let CC = await BotList.findOne({
                            where: {
                                id: uintToInt(parseInt(msg.id, 16)),
                                secret: uintToInt(parseInt(msg.secret, 16))
                            }
                        });
                        if (!CC) return ack({
                            error: "ID not found.",
                            errorDesc: "ID/Secret pair isn't on the DB.",
                            errorCode: 6
                        });

                        let updateObj = {
                            validPingUntil: new Date(Date.now() + 45000)
                        }

                        if (typeof msg.type === "string") updateObj.type = msg.type;
                        if (typeof msg.version === "string") updateObj.version = msg.version;
                        if (typeof msg.extraData === "string" && !validJSONObject(msg.extraData)) updateObj.extraData = msg.extraData;

                        /** @type {number[]} */
                        let ut = JSON.parse(CC.get("uptime"));
                        if (Date.now() > CC.get("validPingUntil").getTime()) {
                            // Update uptime
                            if (ut.length % 2 === 0) {
                                ut.push(CC.get("validPingUntil").getTime());
                            }
                            ut.push(Date.now());
                        }
                        ut = ut.sort((a, b) => b - a);

                        // Calculating uptime percentage (based on last 7 days)
                        let startFrom = ut.reverse().findIndex(v => v < Date.now() - (1000 * 3600 * 24 * 7));
                        let temp = [];
                        if (startFrom === -1) {
                            // All of them. 
                            temp = [CC.get("firstSeen").getTime(), ...ut];
                        } else {
                            let actualStart = ut.length - 1 - startFrom;
                            if (actualStart % 2 === 0) {
                                temp = ut.slice(actualStart + 1);
                            } else {
                                temp = [Date.now() - (1000 * 3600 * 24 * 7), ...ut.slice(actualStart + 1)];
                            }
                        }

                        let temp2 = [];
                        for (let i = 0; i < Math.ceil(temp.length / 2); i++) {
                            temp2.push([temp[2 * i], temp[2 * i + 1]]);
                        }
                        let temp3 = temp2.map(v => v[1] ? v[1] - v[0] : Date.now() - v[0]);
                        let percentageRange = Date.now() - temp[0];
                        let uptimePercentage = temp3.reduce((a, v) => a + v, 0) / percentageRange;

                        CC.update({
                            ...updateObj,
                            uptime: JSON.stringify(ut),
                            uptimeResolved: uptimePercentage
                        });

                        let updatedData = CC.get();
                        APIWS_DATA
                            .to("s_" + parseInt(msg.id, 16).toString(16).padStart(8, "0"))
                            .emit("service_update", {
                                id: parseInt(msg.id, 16).toString(16).padStart(8, "0"),
                                extraData: updatedData.extraData,
                                uptime: updatedData.uptimeResolved,
                                type: updatedData.type,
                                version: updatedData.version,
                                firstSeen: updatedData.firstSeen,
                                validPingUntil: updatedData.validPingUntil
                            });

                        return ack({
                            nonce: msg.nonce,
                            success: true
                        });
                }
            });
        }
    );

    server.listen(process.env.PORT || 3000, () => {
        console.log(`Service started listening at TCP ${server.address().port} (HTTP)`);
    });
})()