script = {
    setup: function () {
        console.log("setting permissions");
        cp.execSync("chmod 770 " + path.app + " -R");

        console.log("updating package list...");
        try { cp.execSync("apt-get update"); } catch (e) { }

        console.log("installing system network packages...");
        cp.execSync("apt-get install -y conntrack nftables isc-dhcp-server bind9 dnsmasq psmisc bmon bpytop tcptrack openvpn wireguard traceroute");

        console.log("installing NPM packages...");
        cp.execSync("cd " + path.app + " ; npm i express");
        cp.execSync("cd " + path.app + " ; npm i ws");
        cp.execSync("cd " + path.app + " ; npm i systeminformation");
        if (cfg.service.telegram.enabled)
            cp.execSync("cd " + path.app + " ; npm i  node-telegram-bot-api");

        console.log("checking if packet forwarding is enabled");
        if (fs.readFileSync("/proc/sys/net/ipv4/ip_forward", 'utf8').includes("0")) {
            console.log("forwarding not enabled!! Enabling now");
            cp.execSync(" sudo sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf");
            cp.execSync("echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward");
            cp.execSync("sudo sysctl -p");
        } else console.log("kernel forwarding is enabled");

        console.log("checking nfTables server...");
        if (!fs.existsSync('/etc/systemd/system/sysinit.target.wants/nftables.service')) {
            cp.execSync("systemctl enable nftables.service");
            console.log("enabling now");
            //needed if have bridge
            cp.execSync("sudo sed 's`Wants=network-pre.target`#Wants=network-pre.target`' /etc/systemd/system/sysinit.target.wants/nftables.service >tmp");
            cp.execSync("sudo mv tmp /etc/systemd/system/sysinit.target.wants/nftables.service");
            cp.execSync("sudo sed 's`Before=network-pre.target shutdown.target`After=network.target' /etc/systemd/system/sysinit.target.wants/nftables.service >tmp");
            cp.execSync("sudo mv tmp /etc/systemd/system/sysinit.target.wants/nftables.service");
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
        try { cp.execSync("mkdir " + path.app + "/tmp"); } catch { }

        console.log("\n\nrouter setup done!!\n");
        process.exit();
    },
    gatewayMonitor: function () {
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
            let gateway = state.gateways[x], config = cfg.network.gateway.pool[x], lostLan = 0, lostLanPercent = 0, averageLan = 0, averageLanCalc = 0,
                lostWan = 0, lostWanPercent = 0, averageWan = 0, wanTotalSamples = cfg.monitor.wan.samples * cfg.monitor.wan.targets.length
                , averageWanTally = wanTotalSamples, averageWanCalc = 0;
            if (cfg.monitor.lan.enable == true) {
                if (state.gateways[cfg.network.gateway.pool.length - 1].sampleLAN.length == cfg.monitor.lan.samples) {
                    if (gateway.sampleWAN[cfg.monitor.wan.targets.length - 1].length == cfg.monitor.wan.samples) start();
                }
            } else if (gateway.sampleWAN[cfg.monitor.wan.targets.length - 1].length == cfg.monitor.wan.samples) start();
            function start() {
                if (state.boot == false) {
                    if (x == cfg.network.gateway.pool.length - 1) state.boot = true;
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
                            console.log("gateway   - " + config.name + " - " + gateway.status + "  -  " + (cfg.monitor.lan.enable ? "LAN average: " + averageLanCalc
                                + " LAN loss: " + lostLanPercent + "%, " : "") + "WAN Average: " + averageWanCalc + " WAN Loss: "
                                + lostWanPercent + "%" + ((gateway.statusPrevious.includes("offline")) ? "  - Was offline for " : "  - Was degraded for ")
                                + (time.epoch - gateway.timer) + " seconds");
                        }
                    } else {
                        console.log("gateway   - " + config.name + " - " + gateway.status + "  -  " + (cfg.monitor.lan.enable ? "LAN average:" + averageLanCalc
                            + " LAN loss: " + lostLanPercent + "%, " : "") + "WAN Average: " + averageWanCalc + " WAN Loss: " + lostWanPercent + "%");
                    }
                    if (gateway.status.includes("online") && gateway.offline == true || gateway.statusPrevious == undefined
                        || gateway.status.includes("offline")) {
                        if (gateway.status == "online") gateway.offline = false;
                        clearTimeout(state.nfTables.timer);
                        state.nfTables.timer = setTimeout(() => { script.mangle(); }, 3e3);
                    }
                    gateway.statusPrevious = gateway.status;
                }
            }

        }
    },
    pingLan: function () {
        let wait = 0;
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
            setTimeout(() => {
                //       console.log("pinging wan " + cfg.network.gateway.pool[x].name + " (" + cfg.network.gateway.pool[x].ip
                //            + ") with mark: " + (x + 1));
                app.pingAsync(cfg.network.gateway.pool[x].ip, state.gateways[x].sampleLAN, state.sampleLAN, 0);
                if (x == cfg.network.gateway.pool.length - 1) {
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
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
            for (let y = 0; y < cfg.monitor.wan.targets.length; y++) {
                setTimeout(() => {
                    //     console.log("pinging wan " + cfg.network.gateway.pool[x].name + " (" + cfg.monitor.wan.targets[y]
                    //          + ") with mark: " + (x + 1));
                    app.pingAsync(cfg.monitor.wan.targets[y], state.gateways[x].sampleWAN[y], state.sampleWAN, (x + 1));
                    if (x == cfg.network.gateway.pool.length - 1 && y == cfg.monitor.wan.targets.length - 1) {
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
            for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
                setTimeout(() => {
                    //    console.log("pinging wan " + cfg.network.gateway.pool[x].name + " (" + cfg.monitor.wan.targets[y]
                    //        + ") with mark: " + (x + 1)); 
                    app.pingAsync(cfg.monitor.wan.targets[y], state.gateways[x].sampleWAN[y], state.sampleWAN, (x + 1));
                    if (x == cfg.network.gateway.pool.length - 1 && y == cfg.monitor.wan.targets.length - 1) {
                        if (state.sampleWAN < cfg.monitor.wan.samples - 1) state.sampleWAN++;
                        else state.sampleWAN = 0;
                        setTimeout(() => { script.pingWanRound(); }, cfg.monitor.wan.interval * 1e3);
                    }
                }, wait);
                wait += cfg.monitor.wan.delay;
            }
        }
    },
    mangle: function () {
        let sequence = [], sequenceAll = [], set = [], numgen = [];
        for (let x = 0; x < state.gateways.length; x++) {
            //   console.log(state.gateways[x].status)
            if (cfg.network.gateway.startAll) {
                if (state.gateways[x].status == undefined
                    || state.gateways[x].status.includes("offline") == false) sequence.push(x);
            } else if (state.gateways[x].status.includes("offline") == false) sequence.push(x);
            sequenceAll.push([x]);
        }
        switch (cfg.network.gateway.mode) {
            case "teaming":
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
                        console.log("gateway   - teaming - all gateways are offline")
                        if (cfg.network.gateway.failAll == false) {
                            console.log("gateway   - teaming - mangle set to first gateway only")
                            numgen = { mode: "inc", mod: 1, offset: 0 }
                            set = [[0, 1]];
                        }
                        else {
                            console.log("gateway   - teaming - mangle set to all gateways")
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
                for (let x = 0; x < state.gateways.length; x++) {
                    let gateway = state.gateways[x];
                    if (state.gatewaySelected == undefined) {
                        if (gateway.status === undefined || gateway.status.includes("online")) { switchGateway(gateway, x); break; }
                    } else if (state.gatewaySelected !== x) {
                        if (state.gateways[state.gatewaySelected].offline == true) {
                            switchGateway(gateway, x); break;
                        } else if (x < state.gatewaySelected && gateway.status.includes("online")) {
                            switchGateway(gateway, x); break;
                        }
                    }
                }
                function switchGateway(gateway, x) {
                    console.log("gateway   - failover - selecting gateway " + cfg.network.gateway.pool[x].name);
                    let interface = gateway.interface || cfg.network.interface[1]
                        ? cfg.network.interface[1].if : cfg.network.interface[0].if;
                    if (cfg.network.gateway.pool[x].allowedIPs != undefined && cfg.network.gateway.pool[x].allowedIPs.length > 0) {
                        console.log("gateway   - failover - applying NAT restricted access");
                        nft.update('nat postrouting', 'masquerade', 'ip saddr {' + cfg.network.gateway.pool[x].allowedIPs
                            + '} oif "' + interface + '" masquerade');
                    } else if (cfg.service.portal.enabled) {
                        nft.update('nat postrouting', 'masquerade', 'ip saddr @allow oif "' + interface + '" masquerade');
                    } else {
                        nft.update("nat postrouting", "masquerade", 'ip saddr ' + cfg.network.interface[0].subnetCIDR[0] + '/'
                            + cfg.network.interface[0].subnetCIDR[1] + ' oif "' + interface + '" masquerade');
                    }
                    try { cp.execSync("ip route delete default"); } catch { }
                    try { cp.execSync("ip route add default via " + cfg.network.gateway.pool[x].ip); } catch { }
                    if (cfg.vpn.wireguard.client && cfg.vpn.wireguard.client.length > 0) app.vpn.wireguard.client.connectAll();
                    state.gatewaySelected = x;
                }
                break;
        }
        function nftWrite() {
            app.nft.tables.mangle[2].rule.expr[2].mangle.value.map.key.numgen = numgen;
            app.nft.tables.mangle[2].rule.expr[2].mangle.value.map.data.set = set;
            function parseIPSubnets(input) {
                const pairs = input.split(", ").map(pair => pair.trim());
                return pairs.map(pair => {
                    const [ip, subnet] = pair.split("/");
                    return { ip, subnet: parseInt(subnet, 10) };
                });
            }
            if (state.nfTables.mangle == undefined) {
                nftCreateTable();
            } else {
                app.nft.tables.mangle[2].rule.handle = state.nfTables.mangle;
                console.log("nftables  - updating mangle table - ", set);
                let command = "printf '" + JSON.stringify({ nftables: [{ replace: app.nft.tables.mangle[2] }] }) + "' | nft -j -f -"
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
                console.log("nftables  - creating mangle ruleset");
                cp.execSync('nft flush chain ip mangle prerouting');
                let mangleNum, rbuf = [];
                app.nft.tables.mangle.forEach((e) => { rbuf.push({ add: e }) });
                let command = "printf '" + JSON.stringify({ nftables: rbuf }) + "' | nft -j -f -"
                cp.execSync(command);
                if (cfg.service.portal.enabled) {
                    console.log("nftables  - adding portal disallow rule");
                    cp.execSync("nft insert rule mangle prerouting ip saddr != @allow return");
                }
                mangleNum = parse(cp.execSync('nft -a list chain ip mangle prerouting').toString(), 'nfsense_mangle" # handle ', '\n')
                console.log("nftables  - mangle table rule handle is: " + Number(mangleNum));
                state.nfTables.mangle = Number(mangleNum);
            }
        }
    },
    checkRoutes: function () {
        //    cp.execSync("sudo tee -a /etc/iproute2/rt_tables").toString();
        let rt_tables = fs.readFileSync("/etc/iproute2/rt_tables", 'utf8');
        let ip_rules = cp.execSync("ip rule show").toString();
        let routes = "", error = false;
        console.log("system    - updating routing tables");
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
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
                cp.execSync("ip route add default via " + cfg.network.gateway.pool[x].ip + " table gw" + (x + 1));
                cp.execSync("ip route add " + cfg.network.interface[0].subnetCIDR[0] + '/'
                    + cfg.network.interface[0].subnetCIDR[1]
                    + " dev " + cfg.network.interface[0].if + " table gw" + (x + 1))
            } catch {
                try {
                    cp.execSync("ip route add default via " + cfg.network.gateway.pool[x].ip + " table gw" + (x + 1));
                    cp.execSync("ip route add " + cfg.network.interface[0].subnetCIDR[0] + '/'
                        + cfg.network.interface[0].subnetCIDR[1]
                        + " dev " + cfg.network.interface[0].if + " table gw" + (x + 1))
                } catch (e) {
                    //  console.log(e);
                    console.log("setting routes encountered an error, will try again in 5 seconds");
                    error = true;
                }
            }
        }
        if (cfg.network.routes != undefined) {
            for (let x = 0; x < cfg.network.routes.length; x++) {
                let route = cfg.network.routes[x]
                try {
                    cp.execSync("ip route add " + route.network + " via " + route.router);
                    console.log("system    - adding route - network:" + route.network + ", router: " + route.router);
                } catch (e) {
                    //   console.log(e);
                    //  console.log("system    - adding route - " + cfg.network.gateway.routes[x] + " - FAILED");
                }
            }
        }
        if (error) setTimeout(() => {
            console.log("trying to set routes again");
            script.checkRoutes();
        }, 5e3);
    },
    calcWeight: function (sequence) {
        let prep = [];
        for (let x = 0; x < sequence.length; x++) prep.push(cfg.network.gateway.pool[x].weight);
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
        pbuf += "gateway   - Users: " + stat.dhcp.total;
        pbuf += " - Total Connections: " + (stat.conntrack.total - 1) + " |";
        for (let x = 0; x < cfg.network.gateway.pool.length; x++)
            pbuf += " R" + (x + 1) + ":" + stat.conntrack.gateways[x] + "|";
        gbuf = "gateway   - Modem Status: |";
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
            gbuf += cfg.network.gateway.pool[x].name + " - ";
            if (state.gateways.status == undefined || state.gateways.status == "online") gbuf += "ON";
            else if (state.gateways.status.includes("offline")) gbuf += "OFF";
            else if (state.gateways.status.includes("degraded")) gbuf += "deg";
            gbuf += " |";
        }
        console.log(pbuf);
        console.log(gbuf);
    },
    getStat: function () {
        stat_nv.bw = stat_nv.bw || [];
        stat_nv.arp = stat_nv.arp || [];
        stat_nv.gateways = stat_nv.gateways || { pingDropsWan: [] };
        stat_nv.conntrack = stat_nv.conntrack || [];
        for (let x = 0; x < cfg.network.interface.length; x++) {
            if (!stat_nv.bw[x]) stat_nv.bw.push([[], []])
            stat_nv.bw[x][0][time.min10] = stat.bw[x][0];
            stat_nv.bw[x][1][time.min10] = stat.bw[x][1];
        }
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
            if (stat_nv.avg5Min.gateways[x] != undefined)
                stat_nv.gateways.pingDropsWan[x]
                    = Math.floor(stat_nv.avg5Min.gateways[x].reduce((a, b) => a + b, 0));
        }
        stat_nv.conntrack[time.min10]
            = Math.floor(stat_nv.avg5Min.conntrack.total.reduce((a, b) => a + b, 0) / 300);
        stat_nv.arp[time.min10] = Math.floor(stat_nv.avg5Min.arp.reduce((a, b) => a + b, 0) / 300);
        file.write("stat_nv");
    },
    getStatSec: function () {
        stat_nv.step5Min = stat_nv.step5Min || 0;
        stat_nv.avg5Min = stat_nv.avg5Min || {};
        stat_nv.avg5Min = stat_nv.avg5Min || {};

        stat_nv.avg5Min.conntrack = stat_nv.avg5Min.conntrack || {};
        stat_nv.avg5Min.conntrack.total = stat_nv.avg5Min.conntrack.total || [];
        stat_nv.avg5Min.arp = stat_nv.avg5Min.arp || [];
        stat_nv.avg5Min.gateways = stat_nv.avg5Min.gateways || [];

        stat_nv.avg5Min.conntrack.total[stat_nv.step5Min] = stat.conntrack.total;
        stat_nv.avg5Min.arp[stat_nv.step5Min] = Object.keys(arp).length;

        if (stat_nv.step5Min < 299) stat_nv.step5Min++; else stat_nv.step5Min = 0;
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
                result[randomString] = { duration: (duration * 60 * 60), speed, multi, created: time.epoch };
            }
            //const vouchertest = script.voucher.generate(10, 3, 86400, 1, false, true);
            console.log("vouchers - creating " + count + " vouchers with a duration of: " + duration + " hours");
            console.log(result);
            Object.assign(voucher, result);
            file.write("voucher");
            return result
        },
        use: function (code, mac) {  // runs when someone click submit on portal login page
            if (voucher[code] && arp[mac]) {
                if (voucher[code].ip != undefined) {
                    if (voucher[code].multi === false) {
                        console.log("vouchers  - relogin - code: " + code + ", for mac: " + mac + " - clearing old IPs");
                        script.voucher.nft(voucher[code].ip, voucher[code].speed, "delete");
                        voucher[code].ip = [arp[mac].ip];
                        voucher[code].mac = mac;
                        script.voucher.nft(arp[mac].ip, voucher[code].speed, "add");
                    } else if (voucher[code].ip.length <= voucher[code].multi) {
                        console.log("vouchers  - relogin - code: " + code + ", for mac: " + mac + " - adding new IP");
                        script.voucher.nft(voucher[code].ip, voucher[code].speed, "add");
                        voucher[code].ip.push(arp[mac].ip)
                        script.voucher.nft(arp[mac].ip, voucher[code].speed, "add");
                    } else console.log("vouchers  - relogin - code: " + code + ", for mac: " + mac + " - no more slots, disallowed");
                    file.write("voucher");
                    voucher[code].update = time.epoch;
                    return true;
                } else {
                    voucher[code].mac = mac;
                    voucher[code].activated = time.epoch;
                    voucher[code].update = time.epoch;
                    voucher[code].ip = [arp[mac].ip];
                    // console.log(voucher[code])
                    console.log("vouchers  - adding voucher: " + code + ", for mac: " + mac + ", with IP: " + arp[mac].ip
                        + " - expires in: " + (voucher[code].duration / 60) + " min");
                    script.voucher.nft(arp[mac].ip, voucher[code].speed, "add");
                    file.write("voucher");
                    return true;
                }
            } else return false;
        },
        prune: function () {
            for (const code in voucher) {
                if (voucher[code] != undefined && voucher[code].activated != undefined
                    && (((time.epoch - voucher[code].activated) / 60) / 60) >= voucher[code].duration) {
                    console.log("vouchers - session expired - code: " + code + ", for MAC: "
                        + voucher[code].mac + " removing IP: ", voucher[code].ip);
                    script.voucher.nft(voucher[code].ip, voucher[code].speed, "delete");
                    delete voucher[code];
                    file.write("voucher");
                }
            }
        },
        pruneGuest: function () {
            let config = cfg.service.portal.guest;
            let guestSpeed = cfg.network.speed.mac.findIndex(obj => obj.name === "guest")
            //  console.log("---------found guest speed  in array position: " + guestSpeed)
            for (const mac in guest) {
                if (guest[mac] != undefined) {
                    if (config.hardLimit == true) {
                        if (guest[mac].lockout == true && ((time.epoch - guest[mac].update) / 60) >= config.lockoutPeriod) {
                            console.log("guest voucher - lockout period expired - for MAC: " + mac + " - removing lockout");
                            script.voucher.nft(guest[mac].ip, guestSpeed, "delete");
                            delete guest[mac];
                            file.write("guest");
                        }
                        if (((time.epoch - guest[mac].activated) / 69) >= config.duration) {
                            script.voucher.nft(guest[mac].ip, guestSpeed, "delete");
                            if (config.lockoutPeriod != undefined && config.lockoutPeriod > 0) {
                                console.log("guest voucher - session hard expired - for MAC: " + mac + ", removing IP: ",
                                    guest[mac].ip + " - getting locked out for " + config.lockoutPeriod + " minutes");
                                guest[mac].lockout = true;
                                guest[mac].update = time.epoch;
                            } else {
                                console.log("guest voucher - session hard expired - mac: " + mac + ", removing IP: ", guest[mac].ip);
                                delete guest[mac];
                            }
                            file.write("guest");
                        }
                    } else if (((time.epoch - guest[mac].update) / 60) >= config.duration) {
                        console.log("guest voucher - session expired (no activity) - mac: " + mac + ", removing IP: ", guest[mac].ip);
                        script.voucher.nft(guest[mac].ip, guestSpeed, "delete");
                        delete guest[mac];
                        file.write("guest");
                    }
                }
            }
        },
        nft: function (ip, speed, action) {
            let buf = ""
            buf += " nft " + action + " element ip nat allow { " + ip + " }";
            if (cfg.service.portal.enabled) {
                if (cfg.network.gateway.mode == "teaming")
                    buf += "; nft " + action + " element ip mangle allow { " + ip + " }";
                buf += ";  nft " + action + " element ip filter " + cfg.network.speed.mac[speed].name + " { " + ip + " }";
            }
            cp.exec(buf, (e) => { /* if (e) console.error(e); */ });
        },
    },
}
app = {
    nft: {
        create: function (flush) {
            nft = app.nft.command;
            state.gatewaySelected = undefined;
            if (cfg.firewall && cfg.firewall.self && cfg.firewall.self.length > 0) {
                console.log("nftables  - flushing input chain");
                cp.execSync('nft flush chain ip filter input');
                for (let x = 0; x < cfg.firewall.self.length; x++) {
                    nft.update("filter input", cfg.firewall.self[x].name, cfg.firewall.self[x].nft);
                }
            }
            console.log("nftables  - flushing forward chain");
            cp.execSync('nft flush chain ip filter forward');
            if (cfg.firewall && cfg.firewall.forward)
                for (let x = 0; x < cfg.firewall.forward.length; x++) {
                    nft.update("filter forward", cfg.firewall.forward[x].name, cfg.firewall.forward[x].nft);
                }

            if (flush !== false) {
                console.log("nftables  - flushing all speed limiter tables");
                cfg.network.speed.mac.forEach(element => { nft.flush("filter", element.name); });
                arp = {};
            }
            console.log("nftables  - flushing mangle chain");
            try { cp.execSync('nft flush chain ip mangle prerouting'); }
            catch {
                try { nft.cTable("mangle", "prerouting", "filter", "dstnat", "accept"); }
                catch {
                    cp.execSync('nft flush table ip mangle');
                    nft.cTable("mangle", "prerouting", "filter", "dstnat", "accept");
                }
            }
            state.nfTables.mangle = undefined;
            if (cfg.network.speed.mac[1] != undefined || cfg.network.speed.ip.length > 0) {
                nft.delete("filter forward", "speed_unrestricted");
                cp.execSync('nft add chain ip filter speed_limiter');
                cp.execSync('nft flush chain ip filter speed_limiter');
                nft.add("filter forward", "speed_jump", "jump speed_limiter");
                cp.execSync('nft add rule ip filter speed_limiter ct state new ip daddr 0.0.0.0/0 accept');
            } else {
                console.log("nftables  - speed - setting no limiters");
                nft.delete("filter forward", "speed_jump");
                nft.add("filter forward", "speed_unrestricted", "ct state related,established ip daddr 0.0.0.0/0 accept");
            }
            if (cfg.network.speed.ip.length > 0) {
                console.log("nftables  - speed - creating MAC limiters");
                nft.speedIP();
            }
            if (cfg.network.speed.mac[1] != undefined) {
                console.log("nftables  - speed - creating MAC limiters");
                nft.speedMAC();
            }
            if (cfg.service.portal.enabled) {
                console.log("nftables  - setting up nat for portal");
                if (flush !== false) {
                    nft.flush("nat", "allow");
                    nft.flush("mangle", "allow");
                    try { cp.execSync('nft flush chain ip nat prerouting'); }
                    catch { createNat(); }
                    cp.execSync('nft flush chain ip nat postrouting');
                }
                nft.update("nat prerouting", "nat_portal_redirect_dns", 'ip saddr != @allow udp dport 53 dnat to '
                    + cfg.network.interface[0].ip + ':52');
                // nft.update("nat prerouting", "nat_portal_redirect_http", 'ip saddr != @allow tcp dport 80 dnat to '
                //    + cfg.network.interface[0].ip + ':80');
                // nft.update("nat prerouting", "nat_portal_redirect_https", 'ip saddr != @allow tcp dport 443 dnat to '
                //     + cfg.network.interface[0].ip + ':443');
                nft.update('nat postrouting', 'masquerade', 'ip saddr @allow oif "'
                    + ((cfg.network.interface[1]) ? cfg.network.interface[1].if : cfg.network.interface[0].if) + '" masquerade');
            } else {
                console.log("nftables  - creating outbound nat");
                try { cp.execSync('nft flush chain ip nat prerouting'); } catch { createNat(); }
                nft.update("nat postrouting", "masquerade", 'ip saddr ' + cfg.network.interface[0].subnetCIDR[0] + '/'
                    + cfg.network.interface[0].subnetCIDR[1] + ' oif "' + ((cfg.network.interface[1])
                        ? cfg.network.interface[1].if : cfg.network.interface[0].if) + '" masquerade');
            }
            if (cfg.firewall) {
                if (cfg.firewall.dnat)
                    for (let x = 0; x < cfg.firewall.dnat.length; x++) {
                        nft.update("nat prerouting", cfg.firewall.dnat[x].name, cfg.firewall.dnat[x].nft);
                    }
                if (cfg.firewall.snat)
                    for (let x = 0; x < cfg.firewall.snat.length; x++) {
                        nft.update("nat postrouting", cfg.firewall.snat[x].name, cfg.firewall.snat[x].nft);
                    }
            }
            function createNat() {
                cp.execSync('nft add table ip nat');
                cp.execSync('nft add chain ip nat prerouting "{ type nat hook prerouting priority filter; policy accept; }"');
                cp.execSync('nft add chain ip nat postrouting "{ type nat hook postrouting priority srcnat; policy accept; }"');
            }
            if (cfg.network.gateway.startAll && flush == true) script.mangle();
        },
        tables: {
            mangle: [
                {
                    rule: {
                        family: "ip",
                        table: "mangle",
                        chain: "prerouting",
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
                                        set: [
                                            {
                                                prefix: {
                                                    addr: "10.0.0.0",
                                                    len: 8
                                                }
                                            },
                                            {
                                                prefix: {
                                                    addr: "192.168.0.0",
                                                    len: 16
                                                }
                                            },
                                            {
                                                prefix: {
                                                    addr: "172.16.0.0",
                                                    len: 16
                                                }
                                            }
                                        ]
                                    }
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
            ]
        },
        command: {
            cTable: function (table, chain, type, priority, policy) {
                console.log("nftables  - creating table - " + table);
                cp.execSync('nft add table ip ' + table);
                console.log("nftables  - creating chain - " + table + " " + chain);
                cp.execSync('nft add chain ip ' + table + ' ' + chain + ' "{ type ' + type + ' hook '
                    + chain + ' priority ' + priority + '; policy ' + policy + '; }"');
            },
            flush: function (chain, name) {
                try {
                    console.log("nftables  - flushing set - " + chain + " - " + name);
                    cp.execSync('nft flush set ip ' + chain + ' ' + name);
                }
                catch {
                    console.log("nftables  - set not found, creating - " + chain + " - " + name);
                    cp.execSync('nft add set ip ' + chain + ' ' + name + ' "{ type ipv4_addr; }"');
                }
            },
            delete: function (chain, name) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nftables  - cannot delete rule - " + chain + " - " + name + ' - rule not found');
                } else {
                    console.log("nftables  - deleting rule - " + chain + " - " + name);
                    cp.execSync('nft delete rule ip ' + chain + ' handle ' + handleNum);
                }
            },
            update: function (chain, name, rule, insert) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nftables  - creating rule - " + chain + " - " + name);
                    cp.execSync('nft ' + (insert ? 'insert' : 'add') + ' rule ip ' + chain + ' ' + rule + ' comment "nfsense_' + name + '"')

                } else {
                    console.log('nftables  - updating rule - ' + chain + ' - ' + name);
                    cp.execSync('nft replace rule ip ' + chain + ' handle ' + handleNum + ' ' + rule + ' comment "nfsense_' + name + '"');
                }
            },
            add: function (chain, name, rule) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nftables  - creating rule - " + chain + " - " + name);
                    cp.execSync('nft add rule ip ' + chain + ' ' + rule + ' comment "nfsense_' + name + '"');
                } else console.log("nftables  - creating rule aborted, exists already - " + chain + " - " + name);
            },
            getHandle: function (chain, name) {
                let handleNum = parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n');
                return Number(handleNum);
            },
            speedMAC: function () {
                timeout = 0;
                let buf = [     // unrestricted class rules
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
                for (let x = 0; x < cfg.network.speed.mac.length; x++) {
                    rule = cfg.network.speed.mac[x];
                    if (x != 0) {
                        console.log("nftables  - creating MAC based speed limiter rule - " + rule.name);
                        buf.push({
                            add: {
                                rule: {
                                    family: "ip",
                                    table: "filter",
                                    chain: "speed_limiter",
                                    comment: "nfsense_mac_speed_download_" + rule.name,
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
                                                name: rule.name + "_mac_download"
                                            }
                                        },
                                        { accept: null }
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
                                    comment: "nfsense_mac_speed_upload_" + rule.name,
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
                                                right: { prefix: { addr: "0.0.0.0", len: 0 } }
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
                                                name: rule.name + "_mac_upload"
                                            }
                                        },
                                        { accept: null }
                                    ]
                                }

                            }
                        })
                    }
                }
                setTimeout(() => {
                    cp.execSync("printf '" + JSON.stringify({ nftables: buf }) + "' | nft -j -f -");
                    timeout + 500;
                }, timeout);

            },
            speedIP: function () {
                let buf = [];   // unrestricted class rules
                for (let x = 0; x < cfg.network.speed.ip.length; x++) {
                    rule = cfg.network.speed.ip[x];
                    if (rule.up == undefined) {
                        console.log("nftables  - creating IP based unrestricted upload speed limiter rule - " + rule.name);
                        buf.push({
                            add: {
                                rule: {
                                    family: "ip",
                                    table: "filter",
                                    chain: "speed_limiter",
                                    comment: "nfsense_ip_unlimited_speed_upload_" + rule.name,
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
                                                right: (rule.set ? { set: rule.set }
                                                    : (rule.range ? { range: rule.range }
                                                        : { prefix: { addr: rule.cidr[0], len: rule.cidr[1] } }))
                                            }
                                        },
                                        {
                                            match: {
                                                op: "==",
                                                left: { payload: { protocol: "ip", field: "daddr" } },
                                                right: { prefix: { addr: "0.0.0.0", len: 0 } }
                                            }
                                        },
                                        { accept: null }
                                    ]
                                }
                            }
                        })
                    } else {
                        console.log("nftables  - creating IP based upload speed limiter rule - " + rule.name);
                        buf.push({
                            rule: {
                                family: "ip",
                                table: "filter",
                                chain: "speed_limiter",
                                comment: "nfsense_ip_speed_upload_" + rule.name,
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
                                            right: { range: rule.range }
                                        }
                                    },
                                    {
                                        match: {
                                            op: "==",
                                            left: { payload: { protocol: "ip", field: "daddr" } },
                                            right: { prefix: { addr: "0.0.0.0", len: 0 } }
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
                                            name: rule.name + "_ip_upload"
                                        }
                                    },
                                    { accept: null }
                                ]
                            }
                        })
                    }
                    if (rule.down == undefined) {
                        console.log("nftables  - creating IP based unrestricted download speed limiter rule - " + rule.name);
                        buf.push({
                            add: {
                                rule: {
                                    family: "ip",
                                    table: "filter",
                                    chain: "speed_limiter",
                                    comment: "nfsense_ip_unlimited_speed_download_" + rule.name,
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
                                                right: (rule.set ? { set: rule.set }
                                                    : (rule.range ? { range: rule.range }
                                                        : { prefix: { addr: rule.cidr[0], len: rule.cidr[1] } }))
                                            }
                                        },
                                        { accept: null }
                                    ]
                                }
                            }
                        })
                    } else {
                        console.log("nftables  - creating IP based download speed limiter rule - " + rule.name);
                        buf.push({
                            rule: {
                                family: "ip",
                                table: "filter",
                                chain: "speed_limiter",
                                comment: "nfsense_ip_speed_download_" + rule.name,
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
                                            left: {
                                                payload: { protocol: "ip", field: "saddr" }
                                            },
                                            right: { prefix: { addr: "0.0.0.0", len: 0 } }
                                        }
                                    },
                                    {
                                        match: {
                                            op: "==",
                                            left: { payload: { protocol: "ip", field: "daddr" } },
                                            right: { range: rule.range }
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
                                            name: rule.name + "_ip_download"
                                        }
                                    },
                                    { accept: null }
                                ]
                            }
                        })
                    }
                }
                cp.execSync("printf '" + JSON.stringify({ nftables: buf }) + "' | nft -j -f -");
            },
        }
    },
    vpn: {
        wireguard: {
            client: {
                connectAll: function () {
                    for (let x = 0; x < cfg.vpn.wireguard.client.length; x++) {
                        if (cfg.vpn.wireguard.client[x].enabled) {
                            console.log("WireGuard - connecting to site: " + cfg.vpn.wireguard.client[x].name);
                            this.service(cfg.vpn.wireguard.client[x], x);
                        }
                    }
                },
                service: function (client, x) {
                    state.wg.client[x] = state.wg.client[x] || { timerKeepAlive: null };
                    let clientState = state.wg.client[x];
                    clearInterval(clientState.timerKeepAlive);
                    let fileName = path.app + "tmp/wg" + x + ".conf";
                    let buf = [
                        "[Interface]",
                        "PrivateKey = " + client.keyPrivate,
                        "Address = " + client.address,
                        "[Peer]",
                        "PublicKey = " + client.keyServer,
                        "Endpoint = " + client.endpoint,
                        "AllowedIPs = " + client.networks,
                        //  "PersistentKeepalive = " + client.keepalive,
                    ]
                    fs.writeFileSync(fileName, buf.join("\n"));
                    try {
                        console.log("\nWireguard - " + client.name + " - shutting down");
                        console.log(cp.execSync("wg-quick down wg" + x).toString());
                        start();
                    }
                    catch (e) {
                        try { start(); } catch { cp.execSync("wg-quick down wg" + x).toString(); start(); }
                        // console.log("\nWireguard - " + client.name + " - shutdown error: ", e.toString());
                    }
                    function start() {
                        setTimeout(() => {
                            console.log("\nWireguard - " + client.name + " - client connecting");
                            try {
                                console.log("\nWireguard - " + client.name + " - successfully connected: "
                                    , cp.execSync("wg-quick up " + fileName).toString());
                                console.log(cp.execSync("wg show").toString());
                            }
                            catch (e) { console.log("\nWireguard - " + client.name + " - connection error: ", e.toString()) }
                            setTimeout(() => {
                                console.log("\nWireguard - " + client.name + " - starting keepalive");
                                keepAlive();
                            }, 5e3);
                        }, 1e3);
                    }
                    function keepAlive() {
                        clientState.timerKeepAlive = setInterval(() => {
                            spawn("ping", ["-c 1", client.keepaliveAddress, "-W 2"], undefined, (data, object) => {
                                if (!data.includes("64 bytes from")) {
                                    console.log("WireGuard - client " + client.name + " dropped a packet, inspecting connection");
                                    spawn("ping", ["-c 4", client.keepaliveAddress, "-W 2", "-i .2"], undefined, (data, object) => {
                                        let loss = Number(parse(data, " received, ", "%"));
                                        if (loss == 100) {
                                            console.log("WireGuard - client " + client.name + " - packet loss is " + loss + " - resetting connection");
                                            setTimeout(() => { app.vpn.wireguard.client.service(client, x); }, (client.reconnect * 1e3));
                                            clearInterval(clientState.timerKeepAlive);
                                        } else console.log("WireGuard - client " + client.name + " - network degraded - packet loss is " + loss);
                                    });
                                }
                                //  console.log(Number(parse(data, " received, ", "%")))
                            });
                        }, (client.keepalive * 1e3));
                    }
                },
            },
            server: function () {
                for (let x = 0; x < cfg.vpn.wireguard.server.length; x++) {
                    let server = cfg.vpn.wireguard.server[x];
                    if (server.enabled) {
                        console.log("WireGuard - starting server: " + cfg.vpn.wireguard.server[x].name);
                        let fileName = path.app + "tmp/wg" + (x + 1000) + ".conf";
                        let buf = [
                            "[Interface]",
                            "ListenPort = " + server.port,
                            "PrivateKey = " + server.keyPrivate,
                            "SaveConfig = false",
                        ]
                        for (let y = 0; y < cfg.vpn.wireguard.server[x].peers.length; y++) {
                            buf.push("[Peer]");
                            buf.push("PublicKey = " + server.peers[y].keyPublic);
                            buf.push("AllowedIPs = " + server.peers[y].networks);
                        }
                        fs.writeFileSync(fileName, buf.join("\n"));
                        try {
                            console.log("\nWireguard - " + server.name + " - shutting down");
                            console.log(cp.execSync("wg-quick down wg" + (x + 1000)).toString());
                            start();
                        }
                        catch (e) {
                            try { start(); } catch { cp.execSync("wg-quick down wg" + (x + 1000)).toString(); start(); }
                            // console.log("\nWireguard - " + server.name + " - shutdown error: ", e.toString());
                        }
                        function start() {
                            setTimeout(() => {
                                console.log("\nWireguard - " + server.name + " - server connecting");
                                try {
                                    console.log("\nWireguard - " + server.name + " - successfully connected: "
                                        , cp.execSync("wg-quick up " + fileName).toString());
                                    console.log(cp.execSync("wg show").toString());
                                }
                                catch (e) { console.log("\nWireguard - " + server.name + " - connection error: ", e.toString()) }
                            }, 1e3);
                        }
                    }
                }
            }
        }
    },
    pingAsync: function (address, result, step, mark) {
        spawn("ping", ["-c 1", address, "-W 2", ((mark) ? ("-m " + mark) : undefined)], undefined, (data, object) => {         // data is the incoming data from the spawn close event (final data). Obj is the original options sent for the future CB
            if (mark) stat_nv.avg5Min.gateways[(mark - 1)] = stat_nv.avg5Min.gateways[(mark - 1)] || [];
            if (data.includes("64 bytes from")) {
                object.result[object.step] = Number(parse(data, "time=", " "));
                if (mark) stat_nv.avg5Min.gateways[(mark - 1)][stat_nv.step5Min] = 0;
            }
            else {
                stat_nv.avg5Min.gateways[(mark - 1)][stat_nv.step5Min] = 1;
                if (mark) object.result[object.step] = false;
            }
        }, { result, step });      // the object that will be sent to the spawn and will be forwarded to the CB above (passthrough object) 
    },
    pingMulti: function (address, count, result, step) {
        spawn("ping", ["-c " + count, address, "-W 2"], undefined, (data, object) => {
            console.log(Number(parse(data, " received, ", "%")))
        }, { result, step });
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
        if (stat.avg.bwStep < (cfg.stat.network.average - 1)) { stat.avg.bwStep++; } else { stat.avg.bwStep = 0; }
        if (stat.avg.cpuStep < (cfg.stat.cpuAverage - 1)) { stat.avg.cpuStep++; } else { stat.avg.cpuStep = 0; }
    },
    getConGateways: function (print) {
        x = 0;
        get();
        //  for (let x = 0; x < cfg.network.gateway.pool.length; x++)
        function get() {
            cp.exec("conntrack -L -m " + (x + 1) + " | grep flow", (error) => {
                stat.conntrack.gateways[x] = Number(parse(error.toString(), "\\(conntrack-tools\\)", " ", undefined, true));
                //    console.log("Gateway " + (x + 1) + ":" + stat.conntrack.gateways[x]);
                if (print && x == cfg.network.gateway.pool.length - 1) { app.getConnTotal(true) }
                else if (x < cfg.network.gateway.pool.length) { x++; get(); }
            })
        }
    },
    getConnTotal: function (print) {
        cp.exec("conntrack -C", (_, data) => {
            stat.conntrack.total = Number(parse(data.toString(), 0, undefined, data.length));

            //   console.log("Total " + stat.conntrack.total);
            if (print) script.printStats();
        })
    },
    getDHCP: function (print) {
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
                stat.dhcp.total = dhcpCount;
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
        function readArpTable() {
            let buf = { add: {}, delete: {} };
            fs.readFile("/proc/net/arp", 'utf8', (err, data) => {
                if (err) {
                    console.error('Failed to read /proc/net/arp:', err);
                    return;
                }
                const newArpTable = parseArpTable(data);
                const changes = diffArpTables(newArpTable, arp);
                arp = newArpTable;
                if (Object.keys(changes.added).length > 0) {
                    buf.add = {}
                    for (const mac in changes.added) {
                        if (cfg.service.portal.enabled == true) {
                            if (user[mac]) {
                                findUser(mac, changes.added[mac].ip, buf.add);
                            } else if (guest[mac]) {
                                //   console.log("ARP       - returning guest session - MAC: ", mac, ", with IP: ", changes.added[mac].ip);
                                guest[mac].update = time.epoch;
                                if (buf.add.guest == undefined) buf.add.guest = { ip: [] };
                                buf.add.guest.ip.push(changes.added[mac].ip);
                            }
                        } else { findUser(mac, changes.added[mac].ip, buf.add); }
                        for (const code in voucher) {
                            if (voucher[code] != undefined && voucher[code].mac != undefined && voucher[code].mac == mac) {
                                console.log("vouchers - resuming session - code: " + code + ", for mac: ", mac, ", with IP: ", changes.added[mac].ip);
                                voucher[code].ip = changes.added[mac].ip;
                                voucher[code].update = time.epoch;
                                if (buf.add[voucher[code].speed] == undefined) buf.add[voucher[code].speed] = { ip: [] };
                                buf.add[voucher[code].speed].ip.push(changes.added[mac].ip);
                            }
                        }
                    }
                    nftUpdate("add", buf.add);
                }
                if (Object.keys(changes.removed).length > 0) {
                    buf.delete = {}
                    for (const mac in changes.removed) {
                        if (cfg.service.portal.enabled == true) {
                            if (user[mac])
                                findUser(mac, changes.removed[mac].ip, buf.delete);
                        } else findUser(mac, changes.removed[mac].ip, buf.delete);
                    }
                    nftUpdate("delete", buf.delete);
                }
                if (Object.keys(changes.updated).length > 0) {
                    buf.add = {};
                    buf.delete = {};
                    for (const mac in changes.updated) {
                        if (cfg.service.portal.enabled == true) {
                            if (user[mac]) {        // if not a registered user, access will be removed by the prune function
                                if (changes.updated[mac].addedIPs.length > 0)
                                    findUser(mac, changes.updated[mac].addedIPs, buf.add);
                                if (changes.updated[mac].removedIPs.length > 0)
                                    findUser(mac, changes.updated[mac].removedIPs, buf.delete);
                            }
                        } else {
                            if (changes.updated[mac].addedIPs.length > 0)
                                findUser(mac, changes.updated[mac].addedIPs, buf.add);
                            if (changes.updated[mac].removedIPs.length > 0)
                                findUser(mac, changes.updated[mac].removedIPs, buf.delete);
                        }
                    }
                    if (Object.keys(buf.delete).length > 0) nftUpdate("delete", buf.delete);
                    if (Object.keys(buf.add).length > 0) nftUpdate("add", buf.add);
                }
            });
            function findUser(mac, ip, tbuf) {
                let speed;  // make an object array for each speed profile
                if (user != undefined && user[mac] != undefined) {
                    console.log("ARP       - urestricted user connection - mac: ", mac, " - ip: ", ip, user[mac]);
                    speed = cfg.network.speed.mac[user[mac].speed].name;
                } else if (guest != undefined && guest[mac] != undefined) {
                    if (cfg.network.speed.mac.some(obj => obj.name === "guest")) speed = "guest";
                    else if (cfg.network.speed.mac.some(obj => obj.name === "global")) speed = "global";
                    else speed = "unrestricted";
                } else {
                    if (cfg.network.speed.mac.some(obj => obj.name === "global")) speed = "global";
                    else speed = "unrestricted";
                }
                if (tbuf[speed] == undefined) tbuf[speed] = { ip: [] }
                tbuf[speed].ip.push(...ip);
            }
        }
        function nftUpdate(type, object) {
            for (const speed in object) {
                let buf = "";
                if (cfg.log.arp) console.log("nftables  - " + type + " IPs: ", object[speed].ip, " for speed class ", speed);
                buf += " nft " + type + " element ip filter " + speed + " { " + object[speed].ip + " }";
                if (cfg.service.portal.enabled) {
                    if (cfg.network.gateway.mode == "teaming")
                        buf += " ; nft " + type + " element ip mangle allow { " + object[speed].ip + " }";
                    buf += " ; nft " + type + " element ip nat allow { " + object[speed].ip + " }";
                }
                cp.exec(buf, (e) => {
                    if (e) {
                        //  console.log(e);
                        if (e.message.includes("Command failed:  nft add element ip")) {
                            console.log("ARP       - flushing NF and ARP tables");
                            app.nft.create(true);
                            script.mangle();
                            state.tableFlushes++;
                            arp = {};
                        } else {
                            state.tableRemovalFail++;
                            console.log("ARP       - bulk ip address removal failed");
                            const regex = /element ip filter (\S+) \{([^}]*)\}/;
                            const match = e.message.match(regex);
                            if (match && match[1] && match[2]) {
                                const elementName = match[1]; // Capture the element name (e.g., "global")
                                const ipAddresses = match[2].split(",").map((ip) => ip.trim()); // Extract and trim IPs
                                console.log(`Retrying for element "${elementName}" with individual IP addresses:`, ipAddresses);
                                // Retry the command for each individual IP address
                                ipAddresses.forEach((ip) => {
                                    const retryCommand = `nft delete element ip filter ${elementName} { ${ip} }`;
                                    cp.exec(retryCommand, (err, out, errOut) => {
                                        if (err) {
                                            console.error(`Failed for IP ${ip} in element "${elementName}":`, err.message);
                                        } else {
                                            console.log(`Success for IP ${ip} in element "${elementName}"`);
                                        }
                                    });
                                });
                            } else {
                                console.error("No element name or IP addresses found in the error message.");
                            }
                        }
                    }
                });
            }
        }
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
                } else {
                    const newIPs = newTable[mac].ip;
                    const oldIPs = oldTable[mac].ip;
                    const addedIPs = newIPs.filter(ip => !oldIPs.includes(ip));
                    const removedIPs = oldIPs.filter(ip => !newIPs.includes(ip));
                    if (addedIPs.length > 0 || removedIPs.length > 0) {
                        changes.updated[mac] = { addedIPs, removedIPs, device: newTable[mac].device };
                    }
                }
            }
            for (const mac in oldTable) {
                if (!newTable[mac]) {
                    changes.removed[mac] = oldTable[mac];
                }
            }
            return changes;
        }
        arpTimer = setInterval(() => {
            if (cfg.service.portal.enabled == true || cfg.network.speed.mac.length > 0) readArpTable();
            else clearInterval(tate.arpTimer);
        }, cfg.network.arpRefresh);
    },
}
server = {
    web: function () {
        web.use(express.json());
        webAdmin.use('/admin', express.static(path.app + '/public'));
        web.use('/', express.static(path.app + '/public'));
        webPublic.use('/monitor', express.static(path.app + '/monitor'));
        function wsObject() {
            return {
                stat,
                statPlus: {
                    arpTable: stat_nv.arp[time.min10],
                    pingDrop: stat_nv.gateways.pingDropsWan,
                },
                state: {
                    gateways: state.gateways,
                },
                chart: { bandwidth: { x: Date.now(), y: stat.bw[0][1], y2: stat.bw[0][0] } },
            };
        }
        webPublic.get('/monitor', (req, res) => {
            res.sendFile(require('path').join(__dirname, "/monitor/monitor.html"));
        });
        webPublic.get('/data', (req, res) => {

            res.json(Array.from({ length: stat_nv.conntrack.length }, (_, i) => ({ x: i, y: stat_nv.conntrack[i] })));
        });
        webAdmin.get('/admin', (req, res) => {
            res.sendFile(require('path').join(__dirname, '/public/index.html'));
        });
        webAdmin.get('/data', (req, res) => {
            const totalBlocks = 144; // 144 ten-minute blocks in a day
            const startIdx = time.min10; // Current 10-min block index

            // Create an array of { x, y } where x represents the original 10-min block index
            let rawData = Array.from({ length: totalBlocks }, (_, i) => ({
                x: i,
                y: stat_nv.conntrack[i]
            }));

            // Rearrange the dataset starting from the current 10-minute block
            let sortedData = rawData.slice(startIdx).concat(rawData.slice(0, startIdx));

            // Generate hour labels (e.g., "00:00", "01:00", etc.) at the correct positions
            let labels = sortedData.map((d, i) => {
                let minutesSinceMidnight = ((startIdx + i) % totalBlocks) * 10;
                let hour = Math.floor(minutesSinceMidnight / 60);
                let minute = minutesSinceMidnight % 60;

                return (minute === 0) ? `${hour.toString().padStart(2, '0')}:00` : ''; // Label only on full hours
            });

            res.json({ data: sortedData, labels: labels });
        });
        webAdmin.get('/logout', (req, res) => {
            client = req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            console.log('webserver - web client logout - ' + clientIp);
            res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
            return res.status(401).send('Logged out.');
        });
        web.get('/admin', (req, res) => {
            res.sendFile(require('path').join(__dirname, '/public/index.html'));
        });
        web.get('/portal', (req, res) => {
            client = req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            //   console.log('webserver - web client accessing portal - ' + clientIp);
            res.sendFile(require('path').join(__dirname, "/public/portal.html"));
        });
        web.get('/welcome', (req, res) => {
            client = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            console.log('webserver - web client accessing portal - ' + clientIp);
            res.sendFile(require('path').join(__dirname, "/public/welcome.html"));
        });
        web.post('/voucher', (req, res) => {
            client = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            let clientMac;
            for (const mac in arp)
                if (clientIp == arp[mac].ip) clientMac = mac;
            const { code } = req.body;
            if (script.voucher.use(code, clientMac)) {
                res.status(200).json({ success: true, redirectUrl: "http://" + cfg.network.interface[0].ip + "/welcome" });
            } else {
                console.log("portal    - voucher valifdation failed, code: ", code);
                res.json({ success: false });
            }
        });
        web.post('/free-internet', (req, res) => {
            let config = cfg.service.portal.guest;
            let client = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            let clientMac;
            for (const mac in arp)
                if (clientIp == arp[mac].ip) clientMac = mac;
            if (guest[clientMac]) {
                if (guest[clientMac].lockout == true) {
                    console.log("portal    - free internet request deliend - lockout - from: ", guest[clientMac]);
                    res.json({ success: "lockout", duration: (config.lockoutPeriod - ((time.epoch - guest[clientMac].update)) / 60) });
                    return;
                }
            } else {
                guest[clientMac] = { ip: clientIp, activated: time.epoch, update: time.epoch };
                console.log("portal    - free internet request from: ", { mac: clientMac, ip: clientIp });
                let buf = "";
                for (let x = 0; x < cfg.network.speed.mac.length; x++) {
                    if (cfg.network.speed.mac[x].name == "guest") {
                        //     console.log("portal    - adding guest to guest speed limiter");
                        buf += " nft add element ip filter guest { " + clientIp + " } ";
                        break;
                    }
                }
                if (cfg.network.gateway.mode == "teaming") {
                    //     console.log("portal    - adding guest to mangle allow list");
                    buf += " ; nft add element ip mangle allow { " + clientIp + " }";
                }
                // console.log("portal    - adding guest to NAT allow list");
                buf += " ; nft add element ip nat allow { " + clientIp + " }";
                // console.log(buf)
                cp.exec(buf, (e) => { if (e) console.log(e) });
                res.status(200).json({ success: true, redirectUrl: "http://" + cfg.network.interface[0].ip + "/welcome" });
                file.write("guest");
            }
        });
        web.post('/send-help', (req, res) => {
            client = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            let clientMac;
            for (const mac in arp)
                if (clientIp == arp[mac].ip) clientMac = mac;


            console.log('portal    - Help message received for IP: ' + clientIp + ", MAC: " + clientMac + " - ", req.body);
            let message = req.body.message;
            if (message.includes("mac") || message.includes("Mac") || message.includes("MAC")) {
                for (let x = 0; x < cfg.service.telegram.admins.length; x++) {
                    bot.sendMessage(cfg.service.telegram.admins[x], 'IP: ' + clientIp + ", MAC: "
                        + clientMac + "\nAdditional Notes:\n" + message);
                }
            } else {
                for (let x = 0; x < cfg.service.telegram.admins.length; x++) {
                    bot.sendMessage(cfg.service.telegram.admins[x], 'Portal help request: ' + req.body.message);
                }
            }
            res.send('Help message received');
        });
        web.get("/diag", (req, res) => {
            res.send({
                state,
                stat,
                stat_nv,
            });
        });
        web.get('/data', (req, res) => {
            res.json(Array.from({ length: 144 }, (_, i) => ({ x: i, y: stat_nv.conntrack[i] })));
        });
        web.get('/test', (req, res) => {
            res.sendFile(require('path').join(__dirname, "/public/data.html"));
        });
        web.get('*', (req, res) => {
            client = req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            let host = req.headers.host;

            if (host === "admin." + cfg.service.dns.localDomain
                //  || host === cfg.service.dns.localDomain
            ) {
                // console.log('webserver - web client - ' + clientIp + " - requesting host: "
                //     , host, " forwarding to portal");
                return res.redirect(302, "https://" + cfg.service.dns.localDomain + ":82/admin");
            }
            for (let x = 0; x < cfg.service.web.redirect.length; x++) {
                redirect = cfg.service.web.redirect[x];
                if (x == 0) {
                    /////////////  console.log("host request: " + host)
                    if (redirect.target
                        == "change only the target if you dont want portal as the default forward - otherwise leave this string") {
                        if (host === cfg.service.dns.localDomain
                            || host == "connectivitycheck.gstatic.com"
                            || host == "www.google.com") {
                            //    console.log("host redirect: " + host)
                            //   console.log('webserver - web client - ' + clientIp + " - requesting host: "
                            //     , host, " forwarding to admin portal - from redirect list");
                            return res.redirect(302, "http://" + cfg.network.interface[cfg.service.portal.interface].ip + "/portal");
                        }
                    }
                }
                if (host === redirect.host) {
                    //     console.log('webserver - web client - ' + clientIp + " - requesting host: "
                    //         , host, " forwarding to: " + redirect.target);
                    return res.redirect(302, redirect.target);
                }
            }
            // console.log('webserver - web client - ' + clientIp + " - requesting host: "
            //     , host, " forwarding to: " + "http://" + cfg.network.interface[cfg.service.portal.interface].ip + "/portal");
            return res.redirect(302, "http://" + cfg.network.interface[cfg.service.portal.interface].ip + "/portal");
            // return res.redirect(302, "http://" + cfg.network.interface[0].ip + "/portal");
        });
        wssPublic.on('connection', (ws, req) => {
            client = req.socket.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            console.log('webserver - websocket client connected - ' + clientIp);
            setInterval(() => {
                ws.send(JSON.stringify({
                    stat,
                    statPlus: {
                        arpTable: stat_nv.arp[time.min10],
                        pingDrop: stat_nv.gateways.pingDropsWan,
                    },
                    state: { gateways: state.gateways, },
                    chart: { bandwidth: { x: Date.now(), y: stat.bw[0][1], y2: stat.bw[0][0] } },
                }));
            }, 1e3);
            ws.send(JSON.stringify({ cfg: { gateways: cfg.network.gateway.pool } }));
        });
        wss.on('connection', (ws, req) => {
            client = req.socket.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            console.log('webserver - websocket client connected - ' + clientIp);
            setInterval(() => { ws.send(JSON.stringify(wsObject())); }, 1e3);
            ws.send(JSON.stringify({ cfg }));
        });
        swss.on('connection', (ws, req) => {
            client = req.socket.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            console.log('webserver - secure websocket client connected - ' + clientIp);
            setInterval(() => { ws.send(JSON.stringify(wsObject())); }, 1e3);
            ws.send(JSON.stringify({ cfg }));
        });
        const basicAuth = (req, res, next) => {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
                return res.status(401).send('Authentication required.');
            }
            // Decode the Authorization header
            const base64Credentials = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
            const [username, password] = credentials.split(':');
            // Check username and password (replace with your actual credentials)
            const validUsername = 'admin';
            const validPassword = 'password123';
            if (username === validUsername && password === validPassword) {
                return next(); // Authentication successful, proceed to the next middleware
            }
            res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
            return res.status(401).send('Invalid credentials.');
        };
        webAdmin.use(basicAuth);
    },
    telegram: function () {
        const userState = {};
        bot.on('polling_error', (error) => { /* console.error('Polling Error:'); */ });
        bot.on('webhook_error', (error) => { /*  console.error('Webhook Error:'); */ });
        process.on('unhandledRejection', (reason, promise) => { /*console.error('Unhandled Rejection: (Telegram)'); */ });
        process.on('uncaughtException', (error) => { console.error('Uncaught Exception: (Telegram)'); });
        bot.setMyCommands([
            { command: '/vouchers', description: 'Create Wouchers' },
            { command: '/permanent_add', description: 'Permanent Add' },
            { command: '/permanent_delete', description: 'Permanent Delete' },
            { command: '/dhcp_add', description: 'DHCP Static Add' },
            { command: '/dhcp_delete', description: 'DHCP Static Delete' },
        ]).then(() => {
            console.log('telegram  - channel commands have been set');
        });
        bot.onText(/\/vouchers/, (msg) => {
            const chatId = msg.chat.id;
            userState[chatId] = { step: 'askQuantity' }; // Track user state
            bot.sendMessage(chatId, 'Create how many vouchers?');
        });
        bot.onText(/\/permanent_add/, (msg) => {
            const chatId = msg.chat.id;
            userState[chatId] = { step: 'askName' };
            bot.sendMessage(chatId, 'Enter Device Name:');
        });
        bot.onText(/\/permanent_delete/, (msg) => {
            const chatId = msg.chat.id;
            userState[chatId] = { step: 'ask_permanent_delete_method' };
            let buf = {
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: "Enter MAC or IP address",
                            callback_data: "enter_mac"
                        }],
                        [{
                            text: "List MAC addresses",
                            callback_data: "list_mac"
                        }]
                    ]
                }
            };
            bot.sendMessage(chatId, 'Deletion Method', buf);
        });
        bot.on('message', (msg) => {
            //  console.log(msg)
            let chatId = msg.chat.id;
            if (!userState[chatId]) return;
            let userInput = msg.text;
            switch (userState[chatId].step) {
                case 'askQuantity':
                    if (isNaN(userInput) || parseInt(userInput) <= 0) {
                        bot.sendMessage(chatId, 'Enter a valid number for the quantity.');
                        return;
                    }
                    userState[chatId].quantity = parseInt(userInput);
                    userState[chatId].step = 'askDuration';
                    bot.sendMessage(chatId, 'What is the duration of vouchers in hours?');
                    break;
                case 'askDuration':
                    if (isNaN(userInput) || parseInt(userInput) <= 0) {
                        bot.sendMessage(chatId, 'Enter a valid number for the duration.');
                        return;
                    }
                    userState[chatId].duration = parseInt(userInput);
                    userState[chatId].step = 'askSpeed';
                    let speedOptions = { reply_markup: { inline_keyboard: [] } };
                    for (let x = 0; x < cfg.network.speed.mac.length; x++) {
                        speedOptions.reply_markup.inline_keyboard.push([{
                            text: cfg.network.speed.mac[x].name,
                            callback_data: x
                        }]);
                    }
                    //   console.log(speedOptions)
                    bot.sendMessage(chatId, 'Select speed profile for vouchers:', speedOptions);
                    break;
                case 'askName':
                    userState[chatId].name = userInput;
                    userState[chatId].step = 'askMacAddress';
                    bot.sendMessage(chatId, 'Enter the MAC or IP address:');
                    break;
                case 'askMacAddress':
                    let macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
                    let targetMac;
                    if (userState[chatId].method == 'delete') {
                        if (macRegex.test(userInput)) {
                            targetMac = userInput;
                            bot.sendMessage(chatId, 'Deleting permanant MAC address: ' + userInput);
                        } else {
                            let found = false;
                            for (const mac in arp)
                                if (userInput == arp[mac].ip) {
                                    bot.sendMessage(chatId, 'Deleting permanant MAC address: ' + mac);
                                    found = true;
                                    targetMac = mac;
                                    break;
                                };
                            if (!found) { bot.sendMessage(chatId, 'Invalid MAC or IP address..'); return; }
                        }
                        delete user[mac];
                        delete userState[chatId];
                        file.write("user");
                        app.nft.create();
                    } else {
                        if (macRegex.test(userInput)) {
                            targetMac = userInput;
                            bot.sendMessage(chatId, 'accepted MAC address: ' + targetMac);
                        } else {
                            let found = false;
                            for (const mac in arp)
                                if (userInput == arp[mac].ip) {
                                    targetMac = mac;
                                    found = true;
                                    bot.sendMessage(chatId, 'found MAC address: ' + targetMac);
                                    break;
                                };
                            if (!found) { bot.sendMessage(chatId, 'Invalid MAC or IP address..'); return; }
                        }
                        userState[chatId].macAddress = targetMac;
                        userState[chatId].step = 'askSpeed';
                        let macSpeedOptions = { reply_markup: { inline_keyboard: [] } };
                        for (let x = 0; x < cfg.network.speed.mac.length; x++) {
                            macSpeedOptions.reply_markup.inline_keyboard.push([{
                                text: cfg.network.speed.mac[x].name,
                                callback_data: x
                            }]);
                        }
                        bot.sendMessage(chatId, 'Select speed profile for this MAC address:', macSpeedOptions);
                    }
                    break;
                default:
                    bot.sendMessage(chatId, 'Unexpected input. Please start over with /vouchers or /permanent_add.');
                    delete userState[chatId]; // Reset state
                    break;
            }
        });
        bot.on('callback_query', (callbackQuery) => {
            let chatId = callbackQuery.message.chat.id;
            let data = callbackQuery.data;
            if (!userState[chatId]) {
                bot.answerCallbackQuery(callbackQuery.id, { text: 'No active process.' });
                return;
            }
            switch (userState[chatId].step) {
                case 'askSpeed':
                    bot.answerCallbackQuery(callbackQuery.id, { text: `You selected: ${cfg.network.speed.mac[data].name}` });
                    if (userState[chatId].macAddress) {  // This is for `/permanent_add`
                        const { name, macAddress } = userState[chatId];
                        const selectedSpeed = cfg.network.speed.mac[data];
                        console.log("telegram - adding permanant MAC: " + macAddress);
                        user[macAddress] = { name, speed: data, added: time.epoch };
                        file.write("user");
                        bot.sendMessage(chatId, `Permanent entry added:\nName: ${name}\nMAC: ${macAddress}\nSpeed: ${selectedSpeed.name}`);
                        app.nft.create();
                    } else if (userState[chatId].quantity && userState[chatId].duration) { // This is for `/vouchers`
                        const { quantity, duration } = userState[chatId];
                        let vouchers = script.voucher.generate(cfg.service.portal.codeLength, quantity, duration, data, false);
                        let codes = [];
                        for (let code in vouchers) codes.push(code);
                        const codelist = codes.join("\n");
                        //  console.log(codelist);
                        bot.sendMessage(chatId, `New Vouchers:\n${codelist}`);
                    }
                    delete userState[chatId]; // Reset state
                    break;
                case 'ask_permanent_delete_method':
                    // console.log("data was: ", callbackQuery)
                    if (data == 'enter_mac') {
                        userState[chatId].method = "delete";
                        userState[chatId].step = 'askMacAddress';
                        bot.sendMessage(chatId, 'Enter MAC or IP address:');
                    }
                    if (data == 'list_mac') {
                        let buf = { reply_markup: { inline_keyboard: [] } };
                        //  console.log(user)
                        for (const mac in user) {
                            buf.reply_markup.inline_keyboard.push([{
                                text: user[mac].name + " - " + mac,
                                callback_data: mac
                            }]);
                        }
                        userState[chatId].step = 'ask_permanent_delete';
                        bot.sendMessage(chatId, 'Select User to Delete:', buf);
                    }
                    break;
                case "ask_permanent_delete":
                    //   console.log("data was: ", data)
                    bot.sendMessage(chatId, 'Deleting permanant MAC address: ' + data);
                    delete user[data];
                    app.nft.create();
                    file.write("user");
                    break;
                default:
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'Unexpected input.' });
                    break;
            }
        });
    },
    dhcp: function () {
        console.log("system    - starting DHCP server...")
        let buffer = '';
        let bufLog = [], logNum = 0;
        serviceConfig();
        service.dhcp = cp.spawn('dhcpd', ['-4', '-f', '-cf', '/etc/dhcp/dhcpd.conf']);
        service.dhcp.stdout.on('data', (chunk) => {
            //////////  console.log("NORMAL DADAT: " + data)
        });
        service.dhcp.stderr.on('data', (chunk) => {
            bufLog[logNum] = chunk.toString();
            if (logNum < 499) logNum++;
            else logNum = 0;
            /* process(chunk);*/
        });
        service.dhcp.on('close', (code) => {
            console.log("system    - dhcpd exited with code: " + code + ", restarting...");
            console.log(bufLog);
            setTimeout(() => { server.dhcp(); }, 3e3);
            cp.exec("killall -9 dhcpd");
            if (buffer.length > 0) console.log('system    - Final incomplete line:', buffer);
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
        function serviceConfig() {
            let param = cfg.service.dhcp;
            let buf = [
                'ddns-update-style none;',
                'log-facility syslog;',
                //     'log_assignments 2;',
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

            ];
            let bufBind;
            for (let x = 0; x < cfg.service.dhcp.bindings.length; x++) {
                let binding = cfg.service.dhcp.bindings[x];
                bufBind = [
                    'host ' + binding.name + ' {',
                    '\thardware ethernet ' + binding.mac + ';',
                    '\tfixed-address ' + binding.ip + ';',
                    '}'
                ]
                buf.push(...bufBind);
            }
            console.log(buf);
            fs.writeFileSync("/etc/dhcp/dhcpd.conf", buf.join("\n"));
        }
    },
    dnsMasq: function () {  // not in use
        console.log("system    - starting DNS server...")
        serviceConfig();
        service.dns = cp.spawn('dnsmasq', ['-d', '-C', path.app + '/tmp/dnsmasq.conf']);
        service.dns.stdout.on('data', (data) => { console.log("NORMAL DADA: " + data) });
        service.dns.stderr.on('data', (data) => { console.log("DNS Server: " + data.toString()) });
        service.dns.on('close', (code) => {
            console.log("system    - DNSMasq exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsMasq(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function serviceConfig() {
            let param = cfg.service.dns;
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
            fs.writeFileSync(path.app + "/tmp/dnsmasq.conf", buf.join("\n"));
        }
    },
    dnsBind9: function () {
        console.log("system    - starting DNS server...")
        serviceConfig();
        service.dns9 = cp.spawn('named', ['-f', '-c', '/etc/bind/named.conf']);
        service.dns9.stdout.on('data', (data) => { console.log("NORMAL DADA: " + data) });
        service.dns9.stderr.on('data', (data) => { console.log("DNS Server: " + data.toString()) });
        service.dns9.on('close', (code, data) => {
            console.log("system    - Bind9 exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsBind9(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function serviceConfig() {
            let param = cfg.service.dns;
            let forwarders = "\tforwarders { ";
            let buf = [
                'options {',
                '\tdirectory "/var/cache/bind";',
                '\tmax-cache-size ' + param.cacheSizeMB + "m;",
                '\tmin-cache-ttl ' + param.cacheTTLmin + ";",
                '\tmax-cache-ttl ' + param.cacheTTLmax + ";",
                '\trate-limit { responses-per-second 500; };',
                '\tdnssec-validation auto;',
                '\tlisten-on { ' + cfg.network.interface[0].ip + '; };',
                '\tlisten-on-v6 { ' + 'none' + '; };',
                '\tallow-query { any; };',
            ];
            if (param.cacheNegative) { buf.push('\tmax-ncache-ttl ' + param.cacheTTLneg + ";") }
            param.forwarders.forEach(element => { forwarders += element + "; "; });
            forwarders += "};";
            buf.push(forwarders);
            buf.push('};');

            cfg.service.dns.zones[0].domain = cfg.service.dns.localDomain;
            cfg.service.dns.zones[0].nameServer = "ns1." + cfg.service.dns.localDomain + ".";
            cfg.service.dns.zones[0].nameServerAddress = cfg.network.interface[0].ip;
            cfg.service.dns.zones[0].records[0].address = cfg.network.interface[0].ip;
            cfg.service.dns.zones[0].records[1].address = cfg.network.interface[0].ip;

            for (let x = 0; x < cfg.service.dns.zones.length; x++) {
                let zone = cfg.service.dns.zones[x];
                let global = cfg.service.dns.global;
                console.log("DNS       - creating zone for - " + zone.domain);
                let bufZone = [
                    "$TTL\t" + global.ttlS,
                    "@\tIN\tSOA\t" + zone.nameServer + " admin." + zone.domain + ". (",
                    "\t\t\t" + "2025020901" + " ; Serial",
                    "\t\t\t" + global.refresh + " ; Refresh",
                    "\t\t\t" + global.retry + " ; Retry",
                    "\t\t\t" + global.expire + " ; Expire",
                    "\t\t\t" + global.ttlMin + " ) ; Minimum TTL",
                    "\tIN\tNS\t" + zone.nameServer + ".",
                ]
                for (let y = 0; y < cfg.service.dns.zones[x].records.length; y++) {
                    record = cfg.service.dns.zones[x].records[y];
                    bufZone.push(record.prefix + "\tIN\t" + record.type + "\t" + record.address + "\t;")
                }
                bufZone.push(zone.nameServer.split('.')[0] + "\tIN\tA\t" + zone.nameServerAddress + "\t;");
                buf.push('zone "' + zone.domain + '" IN { type master; file "/etc/bind/db.' + zone.domain + '"; };');
                fs.writeFileSync("/etc/bind/db." + zone.domain, bufZone.join("\n"));
            }
            console.log(buf)
            fs.writeFileSync("/etc/bind/named.conf", buf.join("\n"));
        }
    },
    dnsBind9Portal: function () {
        console.log("system    - starting Portal DNS server...")
        serviceConfig();
        service.dnsPortal = cp.spawn('named', ['-f', '-c', "/etc/bind/named.conf.local"]);
        service.dnsPortal.stdout.on('data', (chunk) => { console.log("NORMAL DATA: " + data) });
        service.dnsPortal.stderr.on('data', (chunk) => { console.log(chunk.toString()); });
        service.dnsPortal.on('close', (code) => {
            console.log("system    - DNSMasq (Portal) exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsBind9Portal(); }, 3e3);
            cp.exec("killall -9 named");
        });
        function serviceConfig() {
            let zone = [
                "$TTL 86400",
                "@   IN  SOA ns.captive.local. admin.captive.local. (",
                "        2024022001  ; Serial number",
                "        3600        ; Refresh",
                "        1800        ; Retry",
                "        604800      ; Expire",
                "        86400       ; Minimum TTL",
                ")",
                "    IN  NS  ns.captive.local.",
                "ns  IN  A   " + cfg.network.interface[0].ip,
                "*   IN  A   " + cfg.network.interface[0].ip
            ]
            fs.writeFileSync("/etc/bind/db.portal", zone.join("\n"));
            cp.execSync("chmod 644 /etc/bind/db.portal");
            cp.execSync("chown bind:bind /etc/bind/db.portal");
            let conf = [
                'options {',
                '    directory "/var/cache/bind";\n',
                '    listen-on port 52 { ' + cfg.network.interface[0].ip + '; };    # Listen on all interfaces for IPv4',
                '    listen-on-v6 port 52 { any; }; # Listen on all interfaces for IPv6\n',
                '    allow-query { any; };  # Allow queries from all clients',
                '};\n',
                'zone "." IN {',
                '    type master;',
                '    file "/etc/bind/db.portal";',
                '};\n',
            ];
            console.log(conf);
            console.log(zone);
            fs.writeFileSync("/etc/bind/named.conf.local", conf.join("\n"));
            cp.execSync("chmod 644 /etc/bind/named.conf.local");
            cp.execSync("chown bind:bind /etc/bind/named.conf.local");
        }
    },
    dnsMasqPortal: function () {
        console.log("system    - starting Portal DNS server...")
        serviceConfig();
        service.dnsPortal = cp.spawn('dnsmasq', ['-d', '-C', path.app + '/tmp/dnsmasq-portal.conf']);
        service.dnsPortal.stdout.on('data', (chunk) => { console.log("NORMAL DADA: " + data) });
        service.dnsPortal.stderr.on('data', (chunk) => {/* process(chunk);*/ });
        service.dnsPortal.on('close', (code) => {
            console.log("system    - DNSMasq (Portal) exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsMasqPortal(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function serviceConfig() {
            let param = cfg.service.portal;
            let buf = [
                'interface=' + cfg.network.interface[0].if,
                'address=/#/' + cfg.network.interface[0].ip,
                'port=' + 52,
            ];
            console.log("DNS       - Service (portal) Config: ", buf);
            fs.writeFileSync(path.app + "/tmp/dnsmasq-portal.conf", buf.join("\n"));
        }
    },
};
sys = {
    boot: function () {
        sys.lib();
        file.read("cfg"); // config data must be read before init
        sys.checkArgs();
        sys.init();
        console.log("system    - booting...");
        //    send("telegram", "notif", { msg: "nfSense system starting" })
        libLate();
        file.read("voucher");
        file.read("guest");
        file.read("user");
        file.read("stat_nv");

        script.getStatSec();
        script.getStat();
        server.web();
        script.checkRoutes();
        app.nft.create();
        //  if (cfg.network.gateway.startAll) script.mangle();
        if (cfg.service.dhcp.enabled) { server.dhcp(); app.getDHCP(); }
        if (cfg.service.dns.enabled) server.dnsBind9();
        if (cfg.service.portal.enabled) server.dnsBind9Portal();
        if (cfg.vpn.wireguard.server && cfg.vpn.wireguard.server.length > 0) app.vpn.wireguard.server();
        if (cfg.vpn.wireguard.client && cfg.vpn.wireguard.client.length > 0) app.vpn.wireguard.client.connectAll();
        if (cfg.service.telegram.enabled) server.telegram();

        app.getConGateways(true);
        if (cfg.service.portal.enabled || cfg.network.speed.mac.length > 0) {
            console.log("system    - starting ARP tracker")
            app.getArp(cfg.network.interface[0].if);
        }
        if (cfg.monitor.lan.enable) script.pingLan();
        script.pingWanRound();

        setInterval(() => {
            script.gatewayMonitor();
            app.systemInfo();
            script.getStatSec();
            fs.stat('/etc/nftables.conf', (err, stats) => {
                if (state.nfTables.modify == undefined) state.nfTables.modify = stats.mtimeMs;
                else if (state.nfTables.modify != stats.mtimeMs) {
                    console.log("nftables  - rules have been modified - recreating tables...");
                    state.nfTables.modify = stats.mtimeMs;
                    setTimeout(() => { app.nft.create(true); }, 5e3);
                }
            });
        }, 1e3);
        setInterval(() => {
            app.getConnTotal();
            script.voucher.prune();
            script.voucher.pruneGuest();
            if (cfg.service.dhcp.enabled) app.getDHCP();
            script.getStat();
        }, 60e3);
        if (cfg.network.gateway.mode == "teaming") setInterval(() => { app.getConGateways(); }, 300e3);
        console.log("system    - setting network timeouts");
        cp.execSync("echo " + cfg.network.arpTimeout + " > /proc/sys/net/ipv4/neigh/default/gc_stale_time");
        cp.execSync("sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=" + cfg.network.socketTimeout);
    },
    init: function () {
        service = {};
        arp = {};
        spawnC = [];
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
            conntrack: {
                total: 0,
                gateways: [],
            },
            dhcp: {
                total: 0,
            }
        }
        state = {
            boot: false,
            startDelay: 5000,
            sampleLAN: 0,
            sampleWAN: 0,
            arpTimer: null,
            tableFlushes: 0,
            tableRemovalFail: 0,
            gatewaySelected: undefined,
            gateways: [],
            nfTables: {
                timer: null,        // gateway update wait timer
                mangle: undefined,  // mangle rule handle number
                modify: undefined,  // track modify times
            },
            conntrack: {
                totalMin: [],
            },
            dhcp: {
                entries: [],
                entriesLast: [],
                entriesLastPos: 0,
            },
            fileTimer: {},
            wg: {
                client: [

                ]
            }
        }
        for (let x = 0; x < cfg.network.interface.length; x++) {
            stat.bw.push([]);
            stat.avg.bw.push([[], []])
        }
        for (let x = 0; x < cfg.network.gateway.pool.length; x++) {
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
        try { cp.execSync("mkdir " + path.app + "/tmp", { stdio: ['ignore', 'ignore', 'ignore'] }) } catch (e) { }
    },
    lib: function () {
        os = require('os');
        cp = require('child_process');
        fs = require('fs');
        udp = require('dgram').createSocket('udp4');
        events = require('events');
        em = new events.EventEmitter();
        path = {
            lib: require('path'),
            user: os.userInfo().username,
            app: require('path').dirname(require.main.filename) + "/",
            appFile: require('path').basename(__filename),
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
                this.month = date.getMonth() + 1;               // 0 based
                this.day = date.getDate();                      // not 0 based
                this.dow = date.getDay() + 1;                   // 0 based
                this.hour = date.getHours();
                this.min = date.getMinutes();
                this.minDay = this.hour * 60 + this.min;
                this.min5 = Math.floor(this.minDay / 5);
                this.min10 = Math.floor(this.minDay / 10);
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
                const index = spawnC.indexOf(process);
                if (index !== -1) { spawnC.splice(index, 1); }
                if (typeof onClose === 'function') { onClose(data, object); }
            });
            // process.stderr.on('data', (buf) => { console.log(buf); });
            spawnC.push(process);
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
            write: function (file) {
                if (!state.fileTimer[file]) state.fileTimer[file] = null;
                clearTimeout(state.fileTimer[file]);
                state.fileTimer[file] = setTimeout(() => {
                    if (file != "stat_nv" && file != "guest") console.log("system    - saving " + file + " data to: " + path.app + "nfsense-" + file + ".tmp");
                    fs.writeFile(path.app + "nfsense-" + file + ".tmp", JSON.stringify(global[file], null, 2), 'utf-8', (e) => {
                        cp.exec("cp " + path.app + "nfsense-" + file + ".tmp " + path.app + "nfsense-" + file + ".json", () => { });
                    })
                }, 5e3);
            },
            read: function (file) {
                try {
                    console.log("system    - loading " + file + " data");
                    global[file] = JSON.parse(fs.readFileSync(path.app + "nfsense-" + file + ".json", 'utf8'));
                } catch (e) {
                    // console.log(e)
                    console.log("system    - file read error - " + file + " file does not exist, creating");
                    // cp.execSync("touch " + path.app + "nfsense-" + file + ".json")
                    fs.writeFileSync(path.app + "nfsense-" + file + ".json", "{ }", "utf8");
                    global[file] = JSON.parse(fs.readFileSync(path.app + "nfsense-" + file + ".json", 'utf8'));
                    //process.exit();
                }
            }
        };
        libLate = function () {
            if (cfg.service.telegram.enabled) {
                console.log('telegram  - service started');
                TelegramBot = require('node-telegram-bot-api');
                bot = new TelegramBot(cfg.service.telegram.token, { polling: true });
            }
            si = require('systeminformation');
            http = require('http');
            https = require('https');
            express = require('express');
            WebSocket = require('ws');
            web = express();
            webAdmin = express();
            webSecure = express();
            webPublic = express();
            eWeb = http.createServer(web); // HTTP redirect server (port 80)
            eWebPublic = http.createServer(webPublic); // HTTP redirect server (port 80)
            wss = new WebSocket.Server({ server: eWeb }); // WebSocket on port 82
            wssPublic = new WebSocket.Server({ server: eWebPublic }); // WebSocket on port 82
            sslOptions = {
                key: fs.readFileSync(path.app + '/ssl.key'), // Path to your private key
                cert: fs.readFileSync(path.app + '/ssl.crt'), // Path to your certificate
                honorCipherOrder: true, // Use server-defined cipher order instead of the client’s preference
                secureOptions: require('crypto').constants.SSL_OP_NO_TLSv1 | require('crypto').constants.SSL_OP_NO_TLSv1_1, // Disable TLSv1 and TLSv1.1
                ciphers: [
                    'ECDHE-RSA-AES256-GCM-SHA384',
                    'ECDHE-ECDSA-AES256-GCM-SHA384',
                    'ECDHE-RSA-AES128-GCM-SHA256',
                    'ECDHE-ECDSA-AES128-GCM-SHA256',
                    'ECDHE-RSA-AES256-SHA384',
                    'ECDHE-ECDSA-AES256-SHA384',
                    'ECDHE-RSA-AES128-SHA256',
                    'ECDHE-ECDSA-AES128-SHA256',
                ].join(':'),
                ecdhCurve: 'X25519:P-256:P-384:P-521', // Define the curves to use for ECDH
                // dhparam: fs.readFileSync(path.app + '/dhparam.pem'),
            };
            /*
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl.key -out ssl.crt
            sudo apt install openssl
            openssl genrsa -out ssl.key 2048
            openssl req -new -x509 -key ssl.key -out ssl.crt -days 365
            */
            eWebAdmin = https.createServer(sslOptions, webAdmin); // Admin HTTP server (port 82)
            eWebSecure = https.createServer(sslOptions, webSecure); // HTTPS server (port 443)
            swss = new WebSocket.Server({ server: eWebAdmin });   // WSS on HTTPS (port 443)
            eWeb.listen(81, () => console.log('webserver - Redirect server running on port 80'));
            eWebPublic.listen(83, () => console.log('webserver - public server running on port 83'));
            eWebAdmin.listen(82, () => console.log('webserver - HTTP admin web server running on port 82'));
            eWebSecure.listen(443, () => console.log('webserver - HTTPS admin web server running on port 443'));
        };
        send = function (type, typeClass, obj) {
            udp.send(JSON.stringify({ type: type, class: typeClass, obj: obj }), 31, '10.21.88.2', function (error) {
                if (error) { console.log(error) }
            });
        }
        time.startTime();
    },
    checkArgs: function () {
        console.log("system    - checking start arguments");
        if (process.argv[2] == "-i") {
            let service = [
                "[Unit]",
                "Description=nfSense",
                "After=network-online.target",
                "Wants=network-online.target\n",
                "[Install]",
                "WantedBy=multi-user.target\n",
                "[Service]",
                "ExecStart=nodemon " + path.app + "nfsense.js -w " + path.app + "nfsense.js -w " + path.app + "nfsense-config.json --exitcrash",
                "Type=simple",
                "Restart=always",
                "RestartSec=10s",
                "User=root",
                "Group=root",
                "WorkingDirectory=/apps/nfsense",
                "Restart=always\n",
            ];
            console.log(require('path').basename(__filename))
            cp.execSync("touch /etc/systemd/system/nfsense.service");
            cp.execSync("chown $USER /etc/systemd/system/nfsense.service");
            fs.writeFileSync("/etc/systemd/system/nfsense.service", service.join("\n"));
            cp.execSync("mkdir /apps/nfsense -p");
            try { cp.execSync("cp " + path.app + path.appFile + " /apps/nfsense"); } catch { }
            cp.execSync("systemctl daemon-reload");
            cp.execSync("systemctl enable nfsense.service");
            cp.exec("systemctl start nfsense.service");
            console.log("service installed and started!!");
            console.log("type: journalctl -fu nfsense");
            process.exit();
        }
        if (process.argv[2] == "-u") {
            cp.execSync("systemctl stop nfsense.service");
            cp.execSync("systemctl disable nfsense.service");
            cp.execSync("rm /etc/systemd/system/nfsense.service");
            cp.execSync("systemctl daemon-reload");
            console.log("service uninstalled!!");
            process.exit();
        }
        if (process.argv[2] == "-setup") script.setup();
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
                '\t\ttcp dport 443 accept',
                '\t\tip protocol {tcp, udp} th dport 53 accept',
                '\t\tip protocol {tcp, udp} th dport 52 accept',
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

