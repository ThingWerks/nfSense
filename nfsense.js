
debug = true;
script = {
    gatewayMonitor: function () {
        for (let x = 0; x < cfg.gateways.length; x++) {
            let gateway = state.gateways[x], config = cfg.gateways[x], lostLan = 0, lostLanPercent = 0, averageLan = 0, averageLanCalc = 0,
                lostWan = 0, lostWanPercent = 0, averageWan = 0, wanTotalSamples = cfg.monitor.wan.samples * cfg.monitor.wan.targets.length
                , averageWanTally = wanTotalSamples, averageWanCalc = 0;
            if (cfg.monitor.lan.enable == true) {
                if (state.gateways[cfg.gateways.length - 1].sampleLAN.length == cfg.monitor.lan.samples) {
                    if (gateway.sampleWAN[cfg.monitor.wan.targets.length - 1].length == cfg.monitor.wan.samples) start();
                }
            } else if (gateway.sampleWAN[cfg.monitor.wan.targets.length - 1].length == cfg.monitor.wan.samples) start();
            function start() {
                if (state.boot == false) {
                    if (x == cfg.gateways.length - 1) state.boot = true;
                    return;
                } else discover();
            }
            function discover() {
                for (let y = 0; y < cfg.monitor.lan.samples; y++) {
                    if (gateway.sampleLAN[y] === false) lostLan++;
                    else averageLan += gateway.sampleLAN[y];
                }
                for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
                    for (let z = 0; z < cfg.monitor.wan.samples; z++) {
                        if (gateway.sampleWAN[y][z] != false) {
                            averageWan += gateway.sampleWAN[y][z];
                        } else {
                            averageWanTally--;
                            lostWan++;
                        }
                    }
                    lostLanPercent = Math.floor((lostLan / cfg.monitor.lan.samples) * 100);
                    lostWanPercent = Math.floor((lostWan / wanTotalSamples) * 100);
                    averageLanCalc = Math.floor(averageLan / cfg.monitor.lan.samples);
                    averageWanCalc = Math.floor(averageWan / averageWanTally);
                    gateway.pingAverageWAN = averageWanCalc;
                    gateway.pingAverageLAN = averageLanCalc;
                }
                gateway.results = {
                    lanLatency: averageLanCalc, lanLoss: lostLanPercent, wanLatency: averageWanCalc
                    , wanLoss: lostWanPercent, wanSamples: wanTotalSamples, lost: lostWan, pingTotal: averageWan, responses: averageWanTally,
                };
                if (lostLanPercent >= cfg.monitor.lan.lossError) { gateway.status = "offline-LAN loss"; gateway.offline = true; }
                else if (cfg.monitor.lan.lossWarn != undefined && lostLanPercent >= cfg.monitor.lan.lossWarn) gateway.status = "DEG-LLoss";
                else if (averageLanCalc >= cfg.monitor.lan.latencyError) { gateway.status = "offline-LAN latency"; gateway.offline = true; }
                else if (cfg.monitor.lan.latencyWarn - undefined && averageLanCalc >= cfg.monitor.lan.latencyWarn) gateway.status = "DEG-LLate";
                else if (lostWanPercent >= cfg.monitor.wan.lossError) { gateway.status = "offline-WAN loss"; gateway.offline = true; }
                else if (cfg.monitor.wan.lossWarn != undefined && lostWanPercent >= cfg.monitor.wan.lossWarn) gateway.status = "DEG-WLoss";
                else if (averageWanCalc >= cfg.monitor.wan.latencyError) { gateway.status = "offline-WAN latency"; gateway.offline = true; }
                else if (cfg.monitor.wan.latencyWarn != undefined && averageWanCalc >= cfg.monitor.wan.latencyWarn) gateway.status = "DEG-WLate";
                else gateway.status = "online";
                report();
            }
            function report() {
                if (gateway.statusPrevious != gateway.status) {
                    if (gateway.statusPrevious == "online") gateway.timer = time.epoch;
                    if (gateway.status == "online" && gateway.statusPrevious != undefined) {
                        if (time.epoch - gateway.timer >= (cfg.monitor.reconnect)) {
                            console.log("gateway: " + config.name + " is " + gateway.status + "  -  " + (cfg.monitor.lan.enable ? "LAN average: " + averageLanCalc
                                + " LAN loss: " + lostLanPercent + "%, " : "") + "WAN Average: " + averageWanCalc + " WAN Loss: "
                                + lostWanPercent + "%" + ((gateway.statusPrevious.includes("offline")) ? "  - Was offline for " : "  - Was degraded for ")
                                + (time.epoch - gateway.timer) + " seconds");
                        }
                    } else {
                        console.log("gateway: " + config.name + " is " + gateway.status + "  -  " + (cfg.monitor.lan.enable ? "LAN average:" + averageLanCalc
                            + " LAN loss: " + lostLanPercent + "%, " : "") + "WAN Average: " + averageWanCalc + " WAN Loss: " + lostWanPercent + "%");
                    }
                    if (gateway.status.includes("online") && gateway.offline == true || gateway.statusPrevious == undefined
                        || gateway.status.includes("offline")) {
                        if (gateway.status == "online") gateway.offline = false;
                        clearTimeout(state.nfTables.timer);
                        state.nfTables.timer = setTimeout(() => { script.nft(); }, 3e3);
                    }
                    gateway.statusPrevious = gateway.status;
                }
            }

        }
    },
    pingLan: function () {
        let wait = 0;
        for (let x = 0; x < cfg.gateways.length; x++) {
            setTimeout(() => {
                //       console.log("pinging wan " + cfg.gateways[x].name + " (" + cfg.gateways[x].ip
                //            + ") with mark: " + (x + 1));
                app.pingAsync(cfg.gateways[x].ip, state.gateways[x].sampleLAN, state.sampleLAN, 0);
                if (x == cfg.gateways.length - 1) {
                    if (state.sampleLAN < cfg.monitor.lan.samples - 1) state.sampleLAN++;
                    else state.sampleLAN = 0;
                    setTimeout(() => { script.pingLan(); }, cfg.monitor.lan.interval * 1e3);
                }
            }, wait);
            wait += cfg.monitor.lan.delay;
        }
    },
    pingWan: function () {
        let wait = 0;
        for (let x = 0; x < cfg.gateways.length; x++) {
            for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
                setTimeout(() => {
                    //     console.log("pinging wan " + cfg.gateways[x].name + " (" + cfg.monitor.wan.targets[y]
                    //          + ") with mark: " + (x + 1));
                    app.pingAsync(cfg.monitor.wan.targets[y], state.gateways[x].sampleWAN[y], state.sampleWAN, (x + 1));
                    if (x == cfg.gateways.length - 1 && y == cfg.monitor.wan.targets.length - 1) {
                        if (state.sampleWAN < cfg.monitor.wan.samples - 1) state.sampleWAN++;
                        else state.sampleWAN = 0;
                        setTimeout(() => { script.pingWan(); }, cfg.monitor.wan.interval * 1e3);
                    }
                }, wait);
                wait += cfg.monitor.wan.delay;
            }
        }
    },
    pingWanRound: function () {
        let wait = 0;
        for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
            for (let x = 0; x < cfg.gateways.length; x++) {
                setTimeout(() => {
                    //    console.log("pinging wan " + cfg.gateways[x].name + " (" + cfg.monitor.wan.targets[y]
                    //        + ") with mark: " + (x + 1)); 
                    app.pingAsync(cfg.monitor.wan.targets[y], state.gateways[x].sampleWAN[y], state.sampleWAN, (x + 1));
                    if (x == cfg.gateways.length - 1 && y == cfg.monitor.wan.targets.length - 1) {
                        if (state.sampleWAN < cfg.monitor.wan.samples - 1) state.sampleWAN++;
                        else state.sampleWAN = 0;
                        setTimeout(() => { script.pingWanRound(); }, cfg.monitor.wan.interval * 1e3);
                    }
                }, wait);
                wait += cfg.monitor.wan.delay;
            }
        }
    },
    nft: function () {
        let sequence = [], sequenceAll = [], set = [], numgen = [];
        switch (cfg.network.gateway.mode) {
            case "team":
                for (let x = 0; x < state.gateways.length; x++) {
                    //   console.log(state.gateways[x].status)
                    if (cfg.network.gateway.startAll) {
                        if (state.gateways[x].status == undefined
                            || state.gateways[x].status.includes("offline") == false) sequence.push(x);
                    } else if (state.gateways[x].status.includes("offline") == false) sequence.push(x);
                    sequenceAll.push[x];
                }
                if (cfg.network.gateway.weighted == true) {
                    let weights;
                    numgen = { mode: "random", mod: 100, offset: 0 };
                    if (sequence.length == 0) {
                        if (cfg.network.gateway.failAll == false) { set = [[99, 0]]; }
                        else {
                            weights = script.calcWeight(sequenceAll);
                            for (let x = 0; x < sequenceAll.length; x++)
                                set.push([{ range: [weights[x].start, weights[x].end] }, (sequenceAll + 1)])
                        }
                    } else {
                        weights = script.calcWeight(sequence);
                        for (let x = 0; x < sequence.length; x++)
                            set.push([{ range: [weights[x].start, weights[x].end] }, (sequence[x] + 1)])
                    }
                } else {
                    if (sequence.length == 0) {
                        if (cfg.network.gateway.failAll == false) {
                            numgen = { mode: "inc", mod: 1, offset: 0 }
                            set = [[0, 1]];
                        }
                        else {
                            numgen = { mode: "inc", mod: sequenceAll.length, offset: 0 }
                            for (let x = 0; x < sequenceAll.length; x++)
                                set.push([x, sequenceAll[x] + 1]);
                        }
                    } else {
                        numgen = { mode: "inc", mod: sequence.length, offset: 0 }
                        for (let x = 0; x < sequence.length; x++)
                            set.push([x, sequence[x] + 1]);
                    }
                }
                nftWrite();
                break;
            case "failover":
                switch (ColorMode.network.manager) {
                    case "netplan":
                        state.nfTables.data = fs.readFileSync('/etc/netplan/10-dhcp-all-interfaces.yaml', 'utf-8').split(/\r?\n/);
                        for (let x = 0; x < state.nfTables.data.length; x++) {
                            if (state.nfTables.data[x].includes("via: ")) {
                                console.log("gateway found in netplan config, line: " + x);
                                state.nfTables.line = x;
                                break;
                            }
                        }
                        break;
                }
                nftWrite();
                break;

                function nftWrite() {
                    let buf = [];
                    app.nft.tables.mangle[1].rule.expr[2].mangle.value.map.key.numgen = numgen;
                    app.nft.tables.mangle[1].rule.expr[2].mangle.value.map.data.set = set;
                    if (state.nfTables.mangle == undefined) {
                        nftCreateTable();
                    } else {
                        app.nft.tables.mangle[1].rule.handle = state.nfTables.mangle;
                        console.log("updating mangle table...")
                        let command = "printf '" + JSON.stringify({ nftables: [{ replace: app.nft.tables.mangle[1] }] }) + "' | nft -j -f -"
                        cp.exec(command, (e) => {
                            if (e) {
                                console.log("!!!!!!mangle table doesnt exist anymore, nftables must have been flushed!!!!!!")
                                //  console.error(e);
                                app.nft.create(false);
                                nftCreateTable();
                            }
                        })
                    }
                    function nftCreateTable() {
                        console.log("nfTables - mangle rules dont exist");
                        let mangleNum;
                        app.nft.tables.mangle.forEach((e) => { buf.push({ add: e }) });
                        let command = "nft delete chain ip mangle prerouting ; printf '" + JSON.stringify({ nftables: buf }) + "' | nft -j -f -"
                        console.log("nfTables - creating mangle rules...")
                        cp.exec(command, (e) => {
                            if (e) {
                                console.log("nfTables - error - mangle table missing or command failed - recreating");
                                app.nft.create(false);
                                cp.exec('nft delete chain ip mangle prerouting ; ' + command, (e) => { if (e) console.error(e); })
                            }
                            mangleNum = parse(cp.execSync('nft -a list chain ip mangle prerouting').toString(), 'nfsense_mangle" # handle ', '\n')
                            console.log("nfTables - mangle table rule handle is: " + Number(mangleNum));
                            state.nfTables.mangle = Number(mangleNum);
                            //  file.write.nv();
                        });
                    }
                }
        }
    },
    checkRoutes: function () {
        //    cp.execSync("sudo tee -a /etc/iproute2/rt_tables").toString();
        let rt_tables = fs.readFileSync("/etc/iproute2/rt_tables", 'utf8');
        let ip_rules = cp.execSync("ip rule show").toString();
        let routes = "", error = false;
        console.log("updating system routing tables");
        for (let x = 0; x < cfg.gateways.length; x++) {
            if (rt_tables.includes((x + 1) + " gw" + (x + 1))) { } //console.log("rt_tables includes gateway: " + x);
            else {
                // console.log("rt_tables doesnt have gateway: " + x + ", creating...");
                cp.execSync('echo "' + (x + 1) + ' gw' + (x + 1) + '" | tee -a /etc/iproute2/rt_tables');
            }
            if (ip_rules.includes("lookup gw" + (x + 1))) { }// console.log("ip_rules includes gateway: " + x);
            else {
                //  console.log("ip_rules doesnt have gateway: " + x + ", creating...");
                cp.execSync("ip rule add fwmark " + (x + 1) + " table gw" + (x + 1));
            }
            // console.log("ip_route re/creating routes for gateway: " + x);
            try {
                cp.execSync("sudo ip route flush table gw" + (x + 1));
                cp.execSync("ip route add default via " + cfg.gateways[x].ip + " table gw" + (x + 1));
                cp.execSync("ip route add " + cfg.network.interface[0].subnet + " dev " + cfg.network.interface[0].if + " table gw" + (x + 1))
            } catch (e) {
                console.log(e);
                console.log("setting routes encountered an error, will try again in 5 seconds");
                error = true;
            }
        }
        if (error) setTimeout(() => {
            console.log("trying to set routes again");
            script.checkRoutes();
        }, 5e3);
    },
    calcWeight: function (sequence) {
        let prep = [];
        for (let x = 0; x < sequence.length; x++) prep.push(cfg.gateways[x].weight);
        return calc(prep);
        function calc(weights) {
            const totalShares = 100;
            const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
            const shareDistribution = weights.map((weight) =>
                Math.floor((weight / totalWeight) * totalShares)
            );
            let remainingShares = totalShares - shareDistribution.reduce((acc, share) => acc + share, 0);
            for (let i = 0; remainingShares > 0; i = (i + 1) % weights.length) {
                shareDistribution[i]++;
                remainingShares--;
            }
            let currentStart = 0;
            const ranges = shareDistribution.map((share) => {
                const start = currentStart;
                const end = start + share - 1;
                currentStart = end + 1; // Ensure next range starts 1 above the current end
                return { start, end };
            });
            return ranges;
        }
    },
    printStats: function () {
        let pbuf = "", gbuf = "";
        pbuf += "Users: " + state.dhcp.total;
        pbuf += " - Total Connections: " + (state.conntrack.total - 1) + " |";
        for (let x = 0; x < cfg.gateways.length; x++)
            pbuf += " R" + (x + 1) + ":" + state.conntrack.gateways[x] + "|";
        gbuf = "Modem Status: |";
        for (let x = 0; x < cfg.gateways.length; x++) {
            gbuf += cfg.gateways[x].name + " - ";
            if (state.gateways.status == undefined || state.gateways.status == "online") gbuf += "ON";
            else if (state.gateways.status.includes("offline")) gbuf += "OFF";
            else if (state.gateways.status.includes("degraded")) gbuf += "deg";
            gbuf += " |";
        }
        console.log(pbuf);
        console.log(gbuf);
    },
    voucher: {
        generate: function (length, count, duration, speed, multi, lowerCase) {
            const letters = lowerCase ? 'abcdefghijklmnopqrstuvwxyz' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            const numbers = '0123456789';
            const charset = letters + numbers;
            const result = {};
            for (let i = 0; i < count; i++) {
                let randomString = '';
                randomString += letters[Math.floor(Math.random() * letters.length)];
                for (let j = 1; j < length; j++) {
                    randomString += charset[Math.floor(Math.random() * charset.length)];
                }
                result[randomString] = { duration: (duration * 60 * 60), speed, multi };
            }
            //const vouchertest = script.voucher.generate(10, 3, 86400, 1, false, true);
            console.log("vouchers - creating " + count + " vouchers with a duration of: " + duration + " hours");
            Object.assign(voucher, result);
            file.write.voucher();
        },
        find: function (code, mac) {
            if (voucher[code] && state.arp[mac]) {
                if (voucher[code].ip != undefined) {
                    if (voucher[code].multi == 0) {
                        console.log("vouchers - relogin - code: " + code + ", for mac: " + mac + " - clearing old IPs");
                        script.voucher.nft(voucher[code].ip, voucher[code].speed, "delete");
                        voucher[code].ip = [state.arp[mac].ip];
                        voucher[code].mac = mac;
                        script.voucher.nft(state.arp[mac].ip, voucher[code].speed, "add");
                    } else if (voucher[code].ip.length <= voucher[code].multi) {
                        console.log("vouchers - relogin - code: " + code + ", for mac: " + mac + " - adding new IP");
                        script.voucher.nft(voucher[code].ip, voucher[code].speed, "add");
                        voucher[code].ip.push(state.arp[mac].ip)
                        script.voucher.nft(state.arp[mac].ip, voucher[code].speed, "add");
                    } else console.log("vouchers - relogin - code: " + code + ", for mac: " + mac + " - no more slots, disallowed");
                } else {
                    voucher[code].mac = mac;
                    voucher[code].activated = time.epoch;
                    voucher[code].ip = [state.arp[mac].ip];
                    // console.log(voucher[code])
                    console.log("vouchers - adding voucher: " + code + ", for mac: " + mac + ", with IP: " + state.arp[mac].ip
                        + " - expires in: " + (voucher[code].duration / 60) + " min");
                    script.voucher.nft(state.arp[mac].ip, voucher[code].speed, "add");
                }
                file.write.voucher();
            }
        },
        prune: function () {
            for (const code in voucher) {
                if (voucher[code].activated != undefined && time.epoch - voucher[code].activated >= voucher[code].duration) {
                    console.log("vouchers - session expired - code: " + code + ", for MAC: "
                        + voucher[code].mac + " removing IP: ", voucher[code].ip);
                    script.voucher.nft(voucher[code].ip, voucher[code].speed, "delete");
                    voucher[code] = undefined;
                    file.write.voucher();
                }
            }
        },
        nft: function (ip, speed, action) {
            cp.exec(" nft " + action + " element ip nat allow { " + ip + " }"
                + " ; nft " + action + " element ip mangle allow { " + ip + " }"
                + ";  nft " + action + " element ip filter " + cfg.nft.speed[speed].name + " { " + ip + " }"
                , (e) => { if (e) console.error(e); });
        },
    },
}
app = {
    nft: {
        create: function (flush) {
            nft = app.nft.command;

            if (flush !== false) {
                console.log("nftables - flushing all speed limiter tables");
                cfg.nft.speed.forEach(element => { nft.flush("filter", element.name); });
            }

            console.log("nftables - creating table - Mangle");
            nft.cTable("mangle", "prerouting", "filter", "dstnat", "accept");

            if (cfg.nft.speed[1] != undefined) {
                console.log("nfTables - speed - setting global limit");
                nft.delete("filter forward", "speed_unrestricted");
                cp.execSync('nft add chain ip filter speed_limiter');
                nft.add("filter forward", "speed_jump", "jump speed_limiter");
                cp.execSync('nft flush chain ip filter speed_limiter');
                cp.execSync('nft add rule ip filter speed_limiter ct state new ip daddr 0.0.0.0/0 accept');
                nft.speed();
            } else {
                console.log("nfTables - speed - setting no limiters");
                nft.delete("filter forward", "speed_jump");
                nft.add("filter forward", "speed_unrestricted", "ct state related,established ip daddr 0.0.0.0/0 accept");
            }

            if (cfg.network.services.portal.enabled) {
                if (flush !== false) {
                    nft.flush("nat", "allow");
                    nft.flush("mangle", "allow");
                }
                nft.update("nat prerouting", "nat_portal_redirect", 'ip saddr != @allow udp dport 53 dnat to '
                    + cfg.network.interface[0].ip + ':52');
                nft.update('nat postrouting', 'masquerade', 'ip saddr @allow oif "'
                    + cfg.network.interface[1].if + '" masquerade');
            } else {
                console.log("nfTables - creating outbound nat");
                nft.update("nat postrouting", "masquerade", 'ip saddr ' + cfg.network.interface[0].subnet
                    + ' oif "' + cfg.network.interface[1].if + '" masquerade');
            }
        },
        tables: {
            mangle: [
                {
                    chain: {
                        family: "ip",
                        table: "mangle",
                        name: "prerouting",
                        handle: 1,
                        type: "filter",
                        hook: "prerouting",
                        prio: -100,
                        policy: "accept"
                    },
                    rule: {
                        family: "ip",
                        table: "mangle",
                        chain: "prerouting",
                        handle: 4,
                        expr: [
                            {
                                match: {
                                    op: "==",
                                    left: {
                                        payload: {
                                            protocol: "ip",
                                            field: "saddr"
                                        }
                                    },
                                    right: "127.0.0.1"
                                }
                            },
                            {
                                return: null
                            }
                        ]
                    }
                },
                {
                    rule: {
                        family: "ip",
                        table: "mangle",
                        chain: "prerouting",
                        comment: "nfsense_mangle",
                        handle: 6,
                        expr: [
                            {
                                match: {
                                    op: "==",
                                    left: {
                                        payload: {
                                            protocol: "ip",
                                            field: "daddr"
                                        }
                                    },
                                    right: {
                                        prefix: {
                                            addr: "0.0.0.0",
                                            len: 0
                                        }
                                    }
                                }
                            },
                            {
                                match: {
                                    op: "in",
                                    left: {
                                        ct: {
                                            key: "state"
                                        }
                                    },
                                    right: "new"
                                }
                            },
                            {
                                mangle: {
                                    key: {
                                        ct: {
                                            key: "mark"
                                        }
                                    },
                                    value: {
                                        map: {
                                            key: {
                                                numgen: {
                                                    mode: "inc",
                                                    mod: 1,
                                                    offset: 0
                                                }
                                            },
                                            data: {
                                                set: [[0, 1]]
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    rule: {
                        family: "ip",
                        table: "mangle",
                        chain: "prerouting",
                        handle: 7,
                        expr: [
                            {
                                match: {
                                    op: "==",
                                    left: {
                                        payload: {
                                            protocol: "ip",
                                            field: "daddr"
                                        }
                                    },
                                    right: {
                                        prefix: {
                                            addr: "0.0.0.0",
                                            len: 0
                                        }
                                    }
                                }
                            },
                            {
                                match: {
                                    op: "in",
                                    left: {
                                        ct: {
                                            key: "state"
                                        }
                                    },
                                    right: [
                                        "established",
                                        "related"
                                    ]
                                }
                            },
                            {
                                mangle: {
                                    key: {
                                        ct: {
                                            key: "mark"
                                        }
                                    },
                                    value: {
                                        ct: {
                                            key: "mark"
                                        }
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    rule: {
                        family: "ip",
                        table: "mangle",
                        chain: "prerouting",
                        handle: 8,
                        expr: [
                            {
                                mangle: {
                                    key: {
                                        meta: {
                                            key: "mark"
                                        }
                                    },
                                    value: {
                                        ct: {
                                            key: "mark"
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }













            ],
            speed: [],
        },
        command: {
            cTable: function (table, chain, type, priority, policy) {
                console.log("nftables - creating table - " + table);
                cp.execSync('nft add table ip ' + table);
                console.log("nftables - creating chain - " + table + " " + chain);
                cp.execSync('nft add chain ip ' + table + ' ' + chain + ' "{ type ' + type + ' hook '
                    + chain + ' priority ' + priority + '; policy ' + policy + '; }"');
            },
            flush: function (chain, name) {
                try {
                    console.log("nfTables - flushing set - " + chain + " - " + name);
                    cp.execSync('nft flush set ip ' + chain + ' ' + name);
                }
                catch {
                    console.log("nfTables - set not found, creating - " + chain + " - " + name);
                    cp.execSync('nft add set ip ' + chain + ' ' + name + ' "{ type ipv4_addr; }"');
                }
            },
            delete: function (chain, name) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nfTables - cannot deleting rule - " + chain + " - " + name + ' - rule not found');
                } else {
                    console.log("nfTables - deleting rule - " + chain + " - " + name);
                    cp.execSync('nft delete rule ip ' + chain + ' handle ' + handleNum);
                }
            },
            update: function (chain, name, rule) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nfTables - creating rule - " + chain + " - " + name);
                    cp.execSync('nft add rule ip ' + chain + ' ' + rule + ' comment "nfsense_' + name + '"')

                } else {
                    console.log('nfTables - updating rule - ' + chain + ' - ' + name);
                    cp.execSync('nft replace rule ip ' + chain + ' handle ' + handleNum + ' ' + rule + ' comment "nfsense_' + name + '"');
                }
            },
            add: function (chain, name, rule) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nfTables - creating rule - " + chain + " - " + name);
                    cp.execSync('nft add rule ip ' + chain + ' ' + rule + ' comment "nfsense_' + name + '"');
                } else console.log("nfTables - creating rule aborted, exists already - " + chain + " - " + name);
            },
            getHandle: function (chain, name) {
                let handleNum = parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n');
                return Number(handleNum);
            },
            speed: function () {
                let buf = [
                    {
                        add:
                        {
                            rule: {
                                family: "ip",
                                table: "filter",
                                chain: "speed_limiter",
                                handle: 20,
                                expr: [
                                    {
                                        match: {
                                            op: "in",
                                            left: {
                                                ct: {
                                                    key: "state"
                                                }
                                            },
                                            right: [
                                                "established",
                                                "related"
                                            ]
                                        }
                                    },
                                    {
                                        match: {
                                            op: "==",
                                            left: {
                                                payload: {
                                                    protocol: "ip",
                                                    field: "saddr"
                                                }
                                            },
                                            right: {
                                                prefix: {
                                                    addr: "0.0.0.0",
                                                    len: 0
                                                }
                                            }
                                        }
                                    },
                                    {
                                        match: {
                                            op: "==",
                                            left: {
                                                payload: {
                                                    protocol: "ip",
                                                    field: "daddr"
                                                }
                                            },
                                            right: "@unrestricted"
                                        }
                                    },
                                    {
                                        accept: null
                                    }
                                ]
                            }
                        }
                    },
                    {
                        add: {
                            rule: {
                                family: "ip",
                                table: "filter",
                                chain: "speed_limiter",
                                expr: [
                                    {
                                        match: {
                                            op: "in",
                                            left: {
                                                ct: {
                                                    key: "state"
                                                }
                                            },
                                            right: [
                                                "established",
                                                "related"
                                            ]
                                        }
                                    },
                                    {
                                        match: {
                                            op: "==",
                                            left: {
                                                payload: {
                                                    protocol: "ip",
                                                    field: "saddr"
                                                }
                                            },
                                            right: "@unrestricted"
                                        }
                                    },
                                    {
                                        match: {
                                            op: "==",
                                            left: {
                                                payload: {
                                                    protocol: "ip",
                                                    field: "daddr"
                                                }
                                            },
                                            right: {
                                                prefix: {
                                                    addr: "0.0.0.0",
                                                    len: 0
                                                }
                                            }
                                        }
                                    },
                                    {
                                        accept: null
                                    }
                                ]
                            }
                        }
                    }
                ];
                for (let x = 0; x < cfg.nft.speed.length; x++) {
                    rule = cfg.nft.speed[x];
                    if (x != 0) {
                        console.log("nftables - creating speed limiter rule - " + rule.name);
                        buf.push({
                            add: {
                                rule: {
                                    family: "ip",
                                    table: "filter",
                                    chain: "speed_limiter",
                                    comment: "nfsense_speed_in_" + rule.name,
                                    expr: [
                                        {
                                            match: {
                                                op: "in",
                                                left: { ct: { key: "state" } },
                                                right: ["established", "related"]
                                            }
                                        },
                                        {
                                            match: {
                                                op: "==",
                                                left: { payload: { protocol: "ip", field: "saddr" } },
                                                right: { prefix: { addr: "0.0.0.0", len: 0 } }
                                            }
                                        },
                                        {
                                            match: {
                                                op: "==",
                                                left: { payload: { protocol: "ip", field: "daddr" } },
                                                right: "@" + rule.name
                                            }
                                        },
                                        {
                                            meter: {
                                                key: { payload: { protocol: "ip", field: "daddr" } },
                                                stmt: {
                                                    limit: {
                                                        rate: Math.round(rule.down / 8),
                                                        burst: Math.round(rule.downBurst / 8),
                                                        per: "second",
                                                        rate_unit: "kbytes",
                                                        burst_unit: "kbytes"
                                                    }
                                                },
                                                size: 2048,
                                                name: rule.name + "_down"
                                            }
                                        },
                                        {
                                            accept: null
                                        }
                                    ]
                                }
                            }
                        })
                        buf.push({
                            add: {

                                rule: {
                                    family: "ip",
                                    table: "filter",
                                    chain: "speed_limiter",
                                    comment: "nfsense_speed_out_" + rule.name,
                                    expr: [
                                        {
                                            match: {
                                                op: "in",
                                                left: { ct: { key: "state" } },
                                                right: ["established", "related"]
                                            }
                                        },
                                        {
                                            match: {
                                                op: "==",
                                                left: { payload: { protocol: "ip", field: "saddr" } },
                                                right: "@" + rule.name
                                            }
                                        },
                                        {
                                            match: {
                                                op: "==",
                                                left: { payload: { protocol: "ip", field: "daddr" } },
                                                right: {
                                                    prefix: { addr: "0.0.0.0", len: 0 }
                                                }
                                            }
                                        },
                                        {
                                            meter: {
                                                key: { payload: { protocol: "ip", field: "saddr" } },
                                                stmt: {
                                                    limit: {
                                                        rate: Math.round(rule.up / 8),
                                                        burst: Math.round(rule.upBurst / 8),
                                                        per: "second",
                                                        rate_unit: "kbytes",
                                                        burst_unit: "kbytes"
                                                    }
                                                },
                                                size: 2048,
                                                name: rule.name + "_up"
                                            }
                                        },
                                        {
                                            accept: null
                                        }
                                    ]
                                }

                            }
                        })
                    }
                }
                cp.execSync("printf '" + JSON.stringify({ nftables: buf }) + "' | nft -j -f -");
            },
        }
    },
    serverDHCP: function () {
        console.log("starting DHCP server...")
        let buffer = '';
        service();
        services.dhcp = cp.spawn('dhcpd', ['-4', '-d', '-cf', '/etc/dhcp/dhcpd.conf']);
        services.dhcp.stdout.on('data', (chunk) => { console.log("NORMAL DADAT: " + data) });
        services.dhcp.stderr.on('data', (chunk) => {
            //  console.log(chunk.toString())
            /* process(chunk);*/
        });
        services.dhcp.on('close', (code) => {
            console.log("dhcpd exited with code: " + code + ", restarting...");
            setTimeout(() => { app.serverDHCP(); }, 3e3);
            cp.exec("killall -9 dhcpd");
            if (buffer.length > 0) console.log('Final incomplete line:', buffer);
        });
        function process(chunk) {
            buffer += chunk.toString();
            //    console.log(buffer);
            let lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                let reg = {}, found = false;
                if (line.includes("DHCPACK")) {
                    reg = {
                        ip: parse(line, "DHCPACK on ", " "),
                        mac: parse(line, " to ", " "),
                        name: parse(line, " (", ")"),
                    }
                    for (let x = 0; x < state.dhcp.entries.length; x++)
                        if (state.dhcp.entries[x].mac == reg.mac) {
                            //  console.log("mac already added"); 
                            found = true; break;
                        }
                    if (!found) {
                        //   console.log("New DCHP, entry: " + state.dhcp.entriesLastPos + " Reg:", reg)
                        state.dhcp.entries.push(reg);
                        state.dhcp.entriesLast[state.dhcp.entriesLastPos] = reg;
                        if (state.dhcp.entriesLastPos < 19) state.dhcp.entriesLastPos++;
                        else state.dhcp.entriesLastPos = 0
                    }
                }
            }
        }
        function service() {
            let param = cfg.network.services.dhcp;
            let buf = [
                'ddns-update-style none;',
                'log-facility local1;',
                'subnet ' + param.subnet + ' netmask ' + param.mask + ' {',
                '  range ' + param.rangeStart + ' ' + param.rangeEnd + ';',
                '  option domain-name-servers ' + param.nameServer + ';',
                '  option domain-name "' + param.domain + '";',
                '  option subnet-mask ' + param.mask + ';',
                '  option routers ' + param.router + ';',
                '  option broadcast-address ' + param.broadcast + ';',
                '  default-lease-time ' + param.leaseDefault + ';',
                '  max-lease-time ' + param.leaseMax + ';',
                (param.blockUnknown ? '  deny unknown-clients;' : ''),
                '}',
                '  host Daren-v60 {',
                '  hardware ethernet a0:4f:85:e6:e7:7b;',
                '  fixed-address 10.10.0.13;',
                '}'
            ];
            //  console.log("DHCP Service Config: ", buf);
            fs.writeFileSync("/etc/dhcp/dhcpd.conf", buf.join("\n"));
        }
    },
    serverWeb: function () {
        web.use(express.static(path.app + "/public"));
        server.listen(82, () => { console.log('web server running'); });
        web.get("/diag", function (request, response) {
            {
                response.send({
                    //   dhcp: state.dhcp,
                    gateways: state.gateways,
                    nv: nv,
                    //  arp: state.arp,
                })
            };
        });
        web.get('/', (req, res) => { res.sendFile(path.app + '/public/index.html'); });
        web.get('/test', (req, res) => { res.sendFile(path.app + "/public/data.html"); });
        web.get('/data', (req, res) => {
            res.json(Array.from({ length: 60 }, (_, i) => ({ x: i, y: state.conntrack.totalMin[i] })));
        });
        wss.on('connection', (ws) => {
            console.log('Client connected');
            setInterval(() => {
                let newPoint = { x: Date.now(), y: stat.bw[0][1], y2: stat.bw[0][0] };
                ws.send(JSON.stringify({
                    state: {
                        gateways: state.gateways,
                        conntrack: state.conntrack,
                        dhcp: state.dhcp,

                    },
                    stat,
                    chart: { bandwidth: newPoint },
                }));
            }, 1e3);
            ws.send(JSON.stringify({ cfg }));
        });
    },
    serverDNS: function () {        // not in use
        console.log("starting DNS server...")
        service();
        services.dns = cp.spawn('dnsmasq', ['-d', '-C', '/tmp/nfsense/dnsmasq.conf']);
        services.dns.stdout.on('data', (data) => { console.log("NORMAL DADA: " + data) });
        services.dns.stderr.on('data', (data) => { console.log("DNS Server: " + data.toString()) });
        services.dns.on('close', (code) => {
            console.log("DNSMasq exited with code: " + code + ", restarting...");
            setTimeout(() => { app.serverDNS(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function service() {
            let param = cfg.network.services.dns;
            let buf = [
                'interface=' + cfg.network.interface[0].if,
                'bind-interfaces ',
                'no-resolv',
                'log-queries',
                'cache-size=' + param.cacheSize,
                'min-cache-ttl=' + param.cacheTTLmin,
                'max-cache-ttl=' + param.cacheTTLmax,
                'domain-needed',
            ];
            if (param.cacheNegative) { buf.push('neg-ttl=' + param.cacheTTLneg) }
            else { buf.push('no-negcache') }
            param.forwarders.forEach(element => { buf.push('server=' + element); });
            //console.log("DNS Service Config: ", buf);
            fs.writeFileSync("/tmp/nfsense/dnsmasq.conf", buf.join("\n"));
        }
    },
    serverDNSbind9: function () {
        console.log("starting DNS server...")
        service();
        services.dns9 = cp.spawn('named', ['-f', '-c', '/etc/bind/named.conf']);
        services.dns9.stdout.on('data', (data) => { console.log("NORMAL DADA: " + data) });
        services.dns9.stderr.on('data', (data) => { console.log("DNS Server: " + data.toString()) });
        services.dns9.on('close', (code) => {
            console.log("DNSMasq exited with code: " + code + ", restarting...");
            setTimeout(() => { app.serverDNS(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function service() {
            let param = cfg.network.services.dns;
            let forwarders = "forwarders { ";
            let buf = [
                'options {',
                'directory "/var/cache/bind";',
                'max-cache-size ' + param.cacheSizeMB + "m;",
                'min-cache-ttl ' + param.cacheTTLmin + ";",
                'max-cache-ttl ' + param.cacheTTLmax + ";",
                'rate-limit { responses-per-second 500; };',
                'dnssec-validation auto;',
                'listen-on { ' + cfg.network.interface[0].ip + '; };',
                'listen-on-v6 { ' + 'none' + '; };',
                'allow-query { any; };',
            ];
            if (param.cacheNegative) { buf.push('max-ncache-ttl ' + param.cacheTTLneg + ";") }
            param.forwarders.forEach(element => { forwarders += element + "; "; });
            forwarders += "};";
            buf.push(forwarders);
            buf.push('};');
            // console.log("DNS Service Config: ", buf);
            fs.writeFileSync("/etc/bind/named.conf", buf.join("\n"));
        }
    },
    serverDNSportal: function () {
        console.log("starting Portal DNS server...")
        service();
        services.dnsPortal = cp.spawn('dnsmasq', ['-d', '-C', '/tmp/nfsense/dnsmasq-portal.conf']);
        services.dnsPortal.stdout.on('data', (chunk) => { console.log("NORMAL DADA: " + data) });
        services.dnsPortal.stderr.on('data', (chunk) => {/* process(chunk);*/ });
        services.dnsPortal.on('close', (code) => {
            console.log("DNSMasq (Portal) exited with code: " + code + ", restarting...");
            setTimeout(() => { app.serverDNSportal(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function service() {
            let param = cfg.network.services.portal;
            let buf = [
                'interface=' + cfg.network.interface[0].if,
                'address=/#/' + param.dnsServer,
                'port=' + param.dnsServerPort,
            ];
            //  console.log("DNS Service Config: ", buf);
            fs.writeFileSync("/tmp/nfsense/dnsmasq-portal.conf", buf.join("\n"));
        }
    },
    setup: function () {
        console.log("updating package list...");

        try { cp.execSync("apt-get update"); } catch (e) { }

        console.log("installing system network packages...");
        cp.execSync("apt-get install -y conntrack nftables isc-dhcp-server bind9 dnsmasq psmisc bmon bpytop tcptrack openvpn wireguard");

        console.log("installing NPM packages...");
        cp.execSync("cd " + path.app + " ; npm i express");
        cp.execSync("cd " + path.app + " ; npm i ws");
        cp.execSync("cd " + path.app + " ; npm i systeminformation");

        console.log("checking if packet forwarding is enabled");
        if (fs.readFileSync("/proc/sys/net/ipv4/ip_forward", 'utf8').includes("0")) {
            console.log("forwarding not enabled!! Enabling now");
            cp.execSync(" sudo sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf");
            cp.execSync("echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward");
            cp.execSync("sudo sysctl -p");
        } else console.log("kernel forwarding is enabled");

        console.log("checking nfTables service...");
        if (!fs.existsSync('/etc/systemd/system/sysinit.target.wants/nftables.service')) {
            cp.execSync("systemctl enable nftables.service");
            console.log("enabling now");
            //needed if have bridge
            //  cp.execSync("sudo sed 's`Wants=network-pre.target`#Wants=network-pre.target`' /etc/systemd/system/sysinit.target.wants/nftables.service >tmp");
            //  cp.execSync("sudo mv tmp /etc/systemd/system/sysinit.target.wants/nftables.service");
            //  cp.execSync("sudo sed 's`Before=network-pre.target shutdown.target`After=network.target' /etc/systemd/system/sysinit.target.wants/nftables.service >tmp");
            //  cp.execSync("sudo mv tmp /etc/systemd/system/sysinit.target.wants/nftables.service");
        }
        else console.log("already enabled");

        console.log("disabling SystemD Bind9");
        cp.execSync("systemctl stop named.service");
        cp.execSync("systemctl disable named.service");
        console.log("disabling SystemD DNSmasq");
        cp.execSync("systemctl stop dnsmasq.service");
        cp.execSync("systemctl disable dnsmasq.service");
        console.log("disabling SystemD ISC-DHCP-Server");
        cp.execSync("systemctl stop isc-dhcp-server.service");
        cp.execSync("systemctl disable isc-dhcp-server.service");
        cp.execSync("mkdir /tmp/nfsense");

        /*
        if (cfg.network.services.dhcp.enabled) {
            console.log("looking for DHCPD socket based service...");
            if (!fs.existsSync('/etc/systemd/system/isc-dhcp-server.service')) {
                console.log("DHCPD socket service doesn't exist, creating ");
                let service = [
                    "[Unit]",
                    "Description=NFT Helper",
                    "After=network-online.target",
                    "Wants=network-online.target\n",
                    "[Install]",
                    "WantedBy=multi-user.target\n",
                    "[Service]",
                    "ExecStart=socat -u EXEC:'dhcpd -4 -d -cf /etc/dhcp/dhcpd.conf',pty,ctty,stderr UNIX-LISTEN:/tmp/isc-dhcp-server,reuseaddr",
                    "Type=simple",
                    "LogLevelMax=0",
                    "Restart=always",
                    "RestartSec=10ms",
                    "User=root",
                    "Group=root",
                    "WorkingDirectory=/apps/",
                    "Restart=always\n",
                ];
                cp.execSync("touch /etc/systemd/system/isc-dhcp-server.service");
                cp.execSync("chown $USER /etc/systemd/system/isc-dhcp-server.service");
                fs.writeFileSync("/etc/systemd/system/isc-dhcp-server.service", service.join("\n"));
                cp.execSync("mkdir /apps/ -p");
                cp.execSync("systemctl daemon-reload");
                cp.execSync("systemctl enable isc-dhcp-server.service");
                cp.exec("systemctl start isc-dhcp-server.service");
                console.log("DhCPD service installed and started!!");
                console.log("verify with: socat - UNIX-CONNECT:/tmp/isc-dhcp-server");
                process.exit();
            }
            else console.log("already setup");
        }
        */
        console.log("router prep done!!");
        process.exit();
    },
    pingAsync: function (address, result, count, mark) {
        spawn("ping", ["-c 1", address, "-W 2", "-m " + mark], undefined, (data, object) => {         // data is the incoming data from the spawn close event (final data). Obj is the original options sent for the future CB
            if (data.includes("64 bytes from")) object.result[object.count] = Number(parse(data, "time=", " "));
            else object.result[object.count] = false;
        }, { result, count });      // the object that will be sent to the spawn and will be forwarded to the CB above (passthrough object) 
    },
    systemInfo: async function () {
        let cpu = await si.currentLoad();
        let mem = await si.mem();
        let os = await si.osInfo();
        stat.avg.cpu[stat.avg.cpuStep] = ~~cpu.currentLoad;
        stat.cpu = Math.round(stat.avg.cpu.reduce((a, b) => a + b, 0) / stat.avg.cpu.length);
        stat.mem = [
            Math.round((mem.total / 1000000 / 1023)),
            Math.round((mem.active / 1000000 / 1024) * 10) / 10,
            Math.round((mem.cached / 1000000 / 1024) * 10) / 10
        ];
        stat.kernel = os.kernel;
        for (let x = 0; x < cfg.network.interface.length; x++) {
            const netStats = await si.networkStats(cfg.network.interface[x].if);
            stat.avg.bw[x][0][stat.avg.bwStep] = Math.round(((netStats[0].rx_sec * 8) / 1000000) * 10) / 10 || 0;
            stat.avg.bw[x][1][stat.avg.bwStep] = Math.round(((netStats[0].tx_sec * 8) / 1000000) * 10) / 10 || 0;
            stat.bw[x][0] = stat.avg.bw[x][0].reduce((a, b) => a + b, 0) / stat.avg.bw[x][0].length;
            stat.bw[x][1] = stat.avg.bw[x][1].reduce((a, b) => a + b, 0) / stat.avg.bw[x][0].length;
        }
        if (stat.avg.bwStep < (cfg.stat.network.avg - 1)) { stat.avg.bwStep++; } else { stat.avg.bwStep = 0; }
        if (stat.avg.cpuStep < (cfg.stat.cpuAvg - 1)) { stat.avg.cpuStep++; } else { stat.avg.cpuStep = 0; }
    },
    getConGateways: function (print) {
        x = 0;
        get();
        //  for (let x = 0; x < cfg.gateways.length; x++)
        function get() {
            cp.exec("conntrack -L -m " + (x + 1) + " | grep flow", (error) => {
                state.conntrack.gateways[x] = Number(parse(error.toString(), "\\(conntrack-tools\\)", " ", undefined, true));
                //    console.log("Gateway " + (x + 1) + ":" + state.conntrack.gateways[x]);
                if (print && x == cfg.gateways.length - 1) { app.getConnTotal(true) }
                else if (x < cfg.gateways.length) { x++; get(); }
            })
        }
    },
    getConnTotal: function (print) {
        cp.exec("conntrack -C", (_, data) => {
            state.conntrack.total = Number(parse(data.toString(), 0, undefined, data.length));
            state.conntrack.totalMin[time.min] = state.conntrack.total;
            //   console.log("Total " + state.conntrack.total);
            if (print) script.printStats();
        })
    },
    getDHCP: function (print) {     // remove
        state.dhcp.entriesTemp = [];
        let bufEntity = []
        let dhcpCount = 0, leftover = "";
        let test = time.epochMil
        spawn("dhcp-lease-list", ["--parsable"],
            (data) => {
                let chunk = leftover + data.toString();
                let lines = chunk.split("\n");
                leftover = lines.pop();
                for (let line of lines) {
                    bufEntity.push({
                        mac: parse(line, "MAC ", " "),
                        ip: parse(line, "IP ", " "),
                        name: parse(line, "HOSTNAME ", " ")
                    });
                    dhcpCount++;
                }
            },
            () => {
                //  console.log("DHCP refresh done in :  " + (time.epochMil - test) + "ms");
                state.dhcp.total = dhcpCount;
                state.dhcp.entriesTemp = bufEntity;
                for (let x = 0; x < state.dhcp.entriesLast.length; x++) {
                    let found = false;
                    for (let y = 0; y < state.dhcp.entries.length; y++) {
                        if (state.dhcp.entriesLast[x].mac == state.dhcp.entries[y].mac) { found = true; break; }
                    }
                    if (!found) {
                        console.log("!!!!!!found lost DHCP entry during refresh!!!!!!!");
                        state.dhcp.entries.push(state.dhcp.entriesLast[x]);
                    }
                }
                state.dhcp.entriesLastPos = 0;
                if (print) app.getConGateways(true);
            }
        );
    },
    getArp: function (filterInterface) {
        function parseArpTable(data) {
            const lines = data.split('\n').filter(line => line.trim()); // Split lines and remove empty ones
            const parsed = {}; // Store MAC addresses as keys
            lines.slice(1).forEach(line => { // Skip the header line
                const [ip, hwType, flags, mac, mask, device] = line.split(/\s+/);
                if (mac === '00:00:00:00:00:00') return; // Ignore invalid MAC addresses
                if (!filterInterface || device === filterInterface) { // Only process matching interface
                    if (!parsed[mac]) {
                        parsed[mac] = { ip: [ip], device };
                    } else if (!parsed[mac].ip.includes(ip)) {
                        parsed[mac].ip.push(ip); // Add the new IP to the array
                    }
                }
            });
            return parsed;
        }
        function diffArpTables(newTable, oldTable) {
            const changes = { added: {}, removed: {}, updated: {} };
            for (const mac in newTable) {
                if (!oldTable[mac]) {
                    changes.added[mac] = newTable[mac];
                    if (cfg.network.services.portal.enabled == true) {
                        if (user[mac]) nftUpdate(changes.added[mac], mac, "add");
                    } else nftUpdate(changes.added[mac], mac, "add");
                    for (const code in voucher) {
                        if (voucher[code] != undefined && voucher[code].mac != undefined && voucher[code].mac == mac) {
                            console.log("vouchers - resuming session - code: " + code + ", for mac: ", mac, ", with IP: ", newTable[mac].ip);
                            script.voucher.nft(newTable[mac].ip, voucher[code].speed, "add");
                        }
                    }
                } else {
                    const newIPs = newTable[mac].ip;
                    const oldIPs = oldTable[mac].ip;
                    const addedIPs = newIPs.filter(ip => !oldIPs.includes(ip));
                    const removedIPs = oldIPs.filter(ip => !newIPs.includes(ip));
                    if (addedIPs.length > 0 || removedIPs.length > 0) {
                        changes.updated[mac] = { addedIPs, removedIPs, device: newTable[mac].device };
                        if (cfg.network.services.portal.enabled == true) {
                            if (user[mac]) nftUpdate(changes.updated[mac], mac, "add");
                        } else nftUpdate(changes.updated[mac], mac, "add");
                    }
                }
            }
            for (const mac in oldTable) {
                if (!newTable[mac]) {
                    changes.removed[mac] = oldTable[mac];
                    if (cfg.network.services.portal.enabled == true) {
                        if (user[mac]) nftUpdate(changes.removed[mac], mac, "add");
                    } else nftUpdate(changes.removed[mac], mac, "add");
                }
            }
            return changes;
        }
        function readArpTable() {
            fs.readFile("/proc/net/arp", 'utf8', (err, data) => {
                if (err) {
                    console.error('Failed to read /proc/net/arp:', err);
                    return;
                }
                const newArpTable = parseArpTable(data);
                const changes = diffArpTables(newArpTable, state.arp);
                state.arp = newArpTable;
                if (Object.keys(changes.added).length > 0) {
                    //   console.log('Added entries:', changes.added);
                }
                if (Object.keys(changes.removed).length > 0) {
                    //  console.log('Removed entries:', changes.removed);
                }
                if (Object.keys(changes.updated).length > 0) {
                    //  console.log('Updated entries:', changes.updated);
                }
            });
        }
        function nftUpdate(object, mac, action) {
            //  console.log(object)
            let speed;
            if (user == undefined || user[mac] == undefined) speed = "global";
            else speed = cfg.nft.speed[user[mac].speed].name;

            if (object.ip == undefined) {
                if (object.addedIPs != undefined && object.addedIPs.length > 0) {
                    console.log("nftables - adding IP: ", object.addedIPs, " for ", mac);
                    cp.exec(" nft add element ip nat allow { " + object.addedIPs + " }"
                        + " ; nft add element ip mangle allow { " + object.addedIPs + " }"
                        + ";  nft add element ip filter " + speed + " { " + object.addedIPs + " }"
                        , (e) => { if (e) console.error(e); });
                }
                if (object.removedIPs != undefined && object.removedIPs.length > 0) {
                    console.log("nftables - removing IP: ", object.removedIPs, " for ", mac);
                    cp.exec(" nft delete element ip nat allow { " + object.removedIPs + " }"
                        + " ; nft delete element ip mangle allow { " + object.removedIPs + " }"
                        + ";  nft delete element ip filter " + speed + " { " + object.removedIPs + " }"
                        , (e) => { if (e) console.error(e); });
                }
            } else {
                console.log("nftables " + action + " IP: ", object.ip, " for ", mac, " -  speed class: " + speed);
                cp.exec(" nft " + action + " element ip nat allow { " + object.ip + " }"
                    + " ; nft " + action + " element ip mangle allow { " + object.ip + " }"
                    + ";  nft " + action + " element ip filter " + speed + " { " + object.ip + " }"
                    , (e) => { if (e) console.error(e); });
            }
        }
        state.arpTimer = setInterval(() => {
            if (cfg.network.services.portal.enabled == true || cfg.nft.speed.length > 0) readArpTable();
            else clearInterval(tate.arpTimer);
        }, 500);
    },
}
sys = {
    boot: function () {
        sys.lib();
        file.read.cfg();
        sys.init();
        sys.checkArgs();
        console.log("booting...");
        libLate();
        file.read.voucher();
        file.read.user();
        file.read.stat();
        app.serverWeb();
        script.checkRoutes();
        // configure and install nginx on setup, can nginx run inside node?
        app.nft.create();
        if (cfg.network.gateway.startAll) script.nft();
        if (cfg.network.services.dhcp.enabled) { app.serverDHCP(); app.getDHCP(); }
        if (cfg.network.services.dns.enabled) app.serverDNSbind9();
        if (cfg.network.services.portal.enabled) app.serverDNSportal();


        app.getConGateways(true);
        if (cfg.network.services.portal.enabled || cfg.nft.speed.length > 0) {
            console.log("starting ARP tracker")
            app.getArp(cfg.network.interface[0].if);
        }
        if (cfg.monitor.lan.enable) script.pingLan();
        script.pingWanRound();
        setTimeout(() => { }, 500);
        setInterval(() => { script.gatewayMonitor(); app.systemInfo(); }, 1e3);
        setInterval(() => {
            app.getConnTotal();
            script.voucher.prune();
            if (cfg.network.services.dhcp.enabled) app.getDHCP();
        }, 60e3);
        setInterval(() => { app.getConGateways(); }, 300e3);
        console.log("setting ConnTrack socket timeout");
        cp.execSync("sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=" + cfg.network.socketTimeout);
    },
    init: function () {
        services = {};
        stat_nv = {};
        user = {};
        voucher = {};
        stat = {
            cpu: [],
            bw: [],
            mem: [],
            avg: {
                bwStep: 0,
                bw: [],
                cpuStep: 0,
                cpu: [],
            },
        }
        state = {
            boot: false,
            startDelay: 5000,
            sampleLAN: 0,
            sampleWAN: 0,
            arp: {},
            arpTimer: null,
            spawn: [],
            gateways: [],
            nfTables: {
                timer: null,        // gateway update wait timer
                mangle: undefined,  // mangle rule handle number
            },
            conntrack: {
                total: 0,
                totalMin: [],
                gateways: [],
            },
            dhcp: {
                total: 0,
                entries: [],
                entriesLast: [],
                entriesLastPos: 0,
            },
            file: {
                timer: {
                    user: null,
                    voucher: null,
                },
            }
        }
        for (let x = 0; x < cfg.network.interface.length; x++) {
            stat.bw.push([]);
            stat.avg.bw.push([[], []])
        }
        for (let x = 0; x < cfg.gateways.length; x++) {
            state.gateways.push({
                status: undefined,
                offline: false,
                statusPrevious: undefined,
                results: {},
                sampleLAN: [],
                sampleWAN: [],
                timer: time.epoch,
                changes: 0,
                drops: 0,
                pingAverageWAN: 0,
                pingAverageLAN: 0,
            });
            cfg.monitor.wan.targets.forEach(_ => {
                state.gateways[x].sampleWAN.push([])
            });
        }
    },
    lib: function () {
        os = require('os');
        cp = require('child_process');
        fs = require('fs');
        events = require('events');
        em = new events.EventEmitter();
        path = {
            lib: require('path'),
            user: os.userInfo().username,
            app: require('path').dirname(require.main.filename) + "/",
            appFile: require('path').basename(__filename).slice(0, -3),
            home: os.homedir(),
            working: os.homedir() + "/apps/",
            system: "/apps/",
        };
        time = {
            boot: null,
            get epochMil() { return Date.now(); },
            get mil() { return new Date().getMilliseconds(); },
            get stamp() {
                return ("0" + this.month).slice(-2) + "-" + ("0" + this.day).slice(-2) + " "
                    + ("0" + this.hour).slice(-2) + ":" + ("0" + this.min).slice(-2) + ":"
                    + ("0" + this.sec).slice(-2) + "." + ("00" + this.mil).slice(-3);
            },
            sync: function () {
                let date = new Date();
                this.epoch = Math.floor(Date.now() / 1000);
                this.epochMin = Math.floor(Date.now() / 1000 / 60);
                this.month = date.getMonth() + 1;   // 0 based
                this.day = date.getDate();          // not 0 based
                this.dow = date.getDay() + 1;       // 0 based
                this.hour = date.getHours();
                this.min = date.getMinutes();
                this.sec = date.getSeconds();
            },
            startTime: function () {
                function syncAndSchedule() {
                    time.sync();
                    if (time.boot === null) time.boot = 0;
                    let now = Date.now(), nextInterval = 1000 - (now % 1000);
                    setTimeout(() => { syncAndSchedule(); time.boot++; }, nextInterval);
                }
                syncAndSchedule();
            },
        };
        spawn = function (command, args, onData, onClose, object) {
            let data = "";
            let process = cp.spawn(command, args, object);
            process.stdout.on('data', (buf) => {
                data += buf;
                if (typeof onData === 'function') { onData(buf, object); }
            });
            process.on('close', (code) => {
                const index = state.spawn.indexOf(process);
                if (index !== -1) { state.spawn.splice(index, 1); }
                if (typeof onClose === 'function') { onClose(data, object); }
            });
            // process.stderr.on('data', (buf) => { console.log(buf); });
            state.spawn.push(process);
        };
        parse = function (data, startString, endChar, len, isRegex) {
            let sort, pos = 0;
            if (typeof startString === 'number') {
                let obj = [];
                obj[0] = {};
                obj[0].value = data.substring(startString, getEnd(startString, endChar, len, data));
                return obj[0].value;
            } else {
                let obj = [];
                if (!len) len = startString.length;
                if (isRegex) {
                    let regx = new RegExp(startString, "g");
                    while ((sort = regx.exec(data)) !== null) {
                        if (obj[pos] == undefined) obj.push({});
                        obj[pos].value = data.substring(sort.index + len, getEnd(sort.index + len, endChar, len, data));
                        pos++;
                    }
                } else {
                    let index = data.indexOf(startString);
                    while (index !== -1) {
                        if (obj[pos] == undefined) obj.push({});
                        obj[pos].value = data.substring(index + len, getEnd(index + len, endChar, len, data));
                        pos++;
                        index = data.indexOf(startString, index + 1);
                    }
                }
                if (obj[0] != undefined) return obj[0].value;
            }
            function getEnd(index, endChar, len, data) {
                for (let x = index; x < data.length; x++) if (data[x] == endChar) return x;
                return index + len;
            }
        };
        file = {
            write: {
                cfg: function () {
                    clearTimeout(state.file.timer.cfg);
                    state.file.timer.cfg = setTimeout(() => {
                        console.log("saving config data to: " + path.app + 'nfsense-config.tmp');
                        fs.writeFile(path.app + 'nfsense-config.tmp', JSON.stringify(config), 'utf-8', (e) => {
                            cp.exec("cp " + path.app + 'nfsense-config.tmp ' + path.app + 'nfsense-config.json', () => { });
                        })
                    }, 5e3);
                },
                user: function () {
                    clearTimeout(state.file.timer.user);
                    state.file.timer.user = setTimeout(() => {
                        console.log("saving user data to: " + path.app + 'nfsense-user.tmp');
                        fs.writeFile(path.app + 'nfsense-user.tmp', JSON.stringify(user), 'utf-8', (e) => {
                            cp.exec("cp " + path.app + 'nfsense-user.tmp ' + path.app + 'nfsense-user.json', () => { });
                        })
                    }, 5e3);
                },
                voucher: function () {
                    clearTimeout(state.file.timer.voucher);
                    state.file.timer.voucher = setTimeout(() => {
                        console.log("saving voucher data to: " + path.app + 'nfsense-voucher.tmp');
                        fs.writeFile(path.app + 'nfsense-voucher.tmp', JSON.stringify(voucher), 'utf-8', (e) => {
                            cp.exec("cp " + path.app + 'nfsense-voucher.tmp ' + path.app + 'nfsense-voucher.json', () => { });
                        })
                    }, 3e3);
                },
                stat: function () {
                    console.log("saving stat data to: " + path.app + 'nfsense-stat.tmp');
                    fs.writeFile(path.app + 'nfsense-stat.tmp', JSON.stringify(stat_nv), 'utf-8', (e) => {
                        cp.exec("cp " + path.app + 'nfsense-stat.tmp ' + path.app + 'nfsense-stat.json', () => { });
                    })
                }
            },
            read: {
                cfg: function () {
                    try {
                        console.log("loading config data");
                        cfg = JSON.parse(fs.readFileSync(path.app + "nfsense-config.json", 'utf8'));
                    } catch (e) {
                        console.log(e)
                        console.log("cfg file does not exist, exiting");
                        process.exit();
                    }
                },
                user: function () {
                    try {
                        console.log("loading user data");
                        user = JSON.parse(fs.readFileSync(path.app + "nfsense-user.json", 'utf8'));
                        //   console.log(user);
                    } catch {
                        console.log("user file does not exist, creating");
                        fs.writeFileSync(path.app + "nfsense-user.json", JSON.stringify(user));
                    }
                },
                voucher: function () {
                    try {
                        console.log("loading voucher data");
                        voucher = JSON.parse(fs.readFileSync(path.app + "nfsense-voucher.json", 'utf8'));
                        //   console.log(voucher);
                    } catch {
                        console.log("voucher file does not exist, creating");
                        fs.writeFileSync(path.app + "nfsense-voucher.json", JSON.stringify(voucher));
                    }
                },
                stat: function () {
                    try {
                        console.log("loading stat data");
                        stat_nv = JSON.parse(fs.readFileSync(path.app + "nfsense-stat.json", 'utf8'));
                        //   console.log(stat);
                    } catch {
                        console.log("stat file does not exist, creating");
                        fs.writeFileSync(path.app + "nfsense-stat.json", JSON.stringify(stat_nv));
                    }
                },
            }
        };
        libLate = function () {
            express = require('express');
            http = require('http');
            WebSocket = require('ws');
            web = express();
            server = http.createServer(web);
            wss = new WebSocket.Server({ server });
            si = require('systeminformation');
        };
        time.startTime();
    },
    checkArgs: function () {
        console.log("checking start arguments");
        if (process.argv[2] == "-i") {
            let service = [
                "[Unit]",
                "Description=NFT Helper",
                "After=network-online.target",
                "Wants=network-online.target\n",
                "[Install]",
                "WantedBy=multi-user.target\n",
                "[Service]",
                "ExecStart=nodemon /apps/nft-helper.js -w /apps/nft-helper.js --exitcrash",
                "Type=simple",
                "Restart=always",
                "RestartSec=10s",
                "User=root",
                "Group=root",
                "WorkingDirectory=/apps/",
                "Restart=always\n",
            ];
            cp.execSync("touch /etc/systemd/system/nft-helper.service");
            cp.execSync("chown $USER /etc/systemd/system/nft-helper.service");
            fs.writeFileSync("/etc/systemd/system/nft-helper.service", service.join("\n"));
            cp.execSync("mkdir /apps/ -p");
            cp.execSync("systemctl daemon-reload");
            cp.execSync("systemctl enable nft-helper.service");
            cp.exec("systemctl start nft-helper.service");
            console.log("service installed and started!!");
            console.log("type: journalctl -fu nft-helper");
            process.exit();
        }
        if (process.argv[2] == "-u") {
            cp.execSync("systemctl stop nft-helper.service");
            cp.execSync("systemctl disable nft-helper.service");
            cp.execSync("rm /etc/systemd/system/nft-helper.service");
            cp.execSync("systemctl daemon-reload");
            console.log("service uninstalled!!");
            process.exit();
        }
        if (process.argv[2] == "-setup") app.setup();
        if (process.argv[2] == "-nft") {
            config = [
                'flush ruleset',
                'table ip filter {',
                '\tchain input {',
                '\t\ttype filter hook input priority 0',
                '\t\tpolicy drop;',
                '\t\tiif lo accept',
                '\t\tct state related,established accept',
                '\t\tip protocol icmp accept',
                '\t\ttcp dport 22 accept',
                '\t\ttcp dport 953 accept',
                '\t\ttcp dport 80-85 accept',
                '\t\tip protocol {tcp, udp} th dport 53 accept',
                '\t}',
                '\tchain forward {',
                '\t\ttype filter hook forward priority 0',
                '\t\tpolicy drop;',
                '\t\tip protocol icmp accept',
                '\t\tip protocol {tcp, udp} th dport 53 accept',
                '\t\tct state new ip daddr 0.0.0.0/0 accept',
                '\t}',
                '\tchain output {',
                '\t\ttype filter hook output priority 0',
                '\t\taccept',
                '\t}',
                '}',
                'table ip nat {',
                '\tchain prerouting {',
                '\t\ttype nat hook prerouting priority 0',
                '\t}',
                '\tchain postrouting {',
                '\t\ttype nat hook postrouting priority 100',
                '\t}',
                '}',
            ]
            cp.execSync("cp /etc/nftables.conf /etc/nftables.bak");
            fs.writeFileSync("/etc/nftables.conf", config.join("\n"));
            cp.execSync("nft -f /etc/nftables.conf");
            process.exit();
        }



    },
}
sys.boot();

