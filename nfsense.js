
debug = true;
script = {
    setup: function () {
        console.log("updating package list...");

        try { cp.execSync("apt-get update"); } catch (e) { }

        console.log("installing system network packages...");
        cp.execSync("apt-get install -y conntrack nftables isc-dhcp-server bind9 dnsmasq psmisc bmon bpytop tcptrack openvpn wireguard traceroute");

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

        console.log("checking nfTables server...");
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
        cp.execSync("mkdir " + path.app + "/tmp");

        console.log("\n\nrouter setup done!!\n");
        process.exit();
    },
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
                    sequenceAll.push([x]);
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
        }
        function nftWrite() {
            let buf = [];
            // set rule for vpn subnets to bypass mangle rule
            app.nft.tables.mangle[1].rule.expr[0].match.right.set[0].prefix.addr = cfg.network.interface[0].subnetCIDR[0];
            app.nft.tables.mangle[1].rule.expr[0].match.right.set[0].prefix.len = cfg.network.interface[0].subnetCIDR[1];
            app.nft.tables.mangle[3].rule.expr[2].mangle.value.map.key.numgen = numgen;
            app.nft.tables.mangle[3].rule.expr[2].mangle.value.map.data.set = set;

            app.nft.tables.mangle[1].rule.expr[0].match.right.set.push({ prefix: { addr: "10.21.55.0", len: 24 } })
            app.nft.tables.mangle[1].rule.expr[0].match.right.set.push({ prefix: { addr: "10.21.88.0", len: 24 } })

            //    console.log(app.nft.tables.mangle[1].rule.expr[2].mangle.value.map.data)
            if (state.nfTables.mangle == undefined) {
                nftCreateTable();
            } else {
                app.nft.tables.mangle[3].rule.handle = state.nfTables.mangle;
                console.log("nftables  - updating mangle table...")
                let command = "printf '" + JSON.stringify({ nftables: [{ replace: app.nft.tables.mangle[3] }] }) + "' | nft -j -f -"
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
                console.log("nftables  - mangle rules dont exist");
                let mangleNum;
                app.nft.tables.mangle.forEach((e) => { buf.push({ add: e }) });
                let command = "nft delete chain ip mangle prerouting ; printf '" + JSON.stringify({ nftables: buf }) + "' | nft -j -f -"
                console.log("nftables  - creating mangle rules...")
                cp.exec(command, (e) => {
                    if (e) {
                        console.log("nftables  - error - mangle table missing or command failed - recreating");
                        app.nft.create(false);
                        cp.exec('nft delete chain ip mangle prerouting ; ' + command, (e) => { if (e) console.error(e); })
                    }
                    mangleNum = parse(cp.execSync('nft -a list chain ip mangle prerouting').toString(), 'nfsense_mangle" # handle ', '\n')
                    console.log("nftables  - mangle table rule handle is: " + Number(mangleNum));
                    state.nfTables.mangle = Number(mangleNum);
                    //  file.write.nv();
                });
            }
        }
    },
    checkRoutes: function () {
        //    cp.execSync("sudo tee -a /etc/iproute2/rt_tables").toString();
        let rt_tables = fs.readFileSync("/etc/iproute2/rt_tables", 'utf8');
        let ip_rules = cp.execSync("ip rule show").toString();
        let routes = "", error = false;
        console.log("system    - updating routing tables");
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
                cp.execSync("ip route add " + cfg.network.interface[0].subnetCIDR[0] + '/'
                    + cfg.network.interface[0].subnetCIDR[1]
                    + " dev " + cfg.network.interface[0].if + " table gw" + (x + 1))
            } catch {
                try {
                    cp.execSync("ip route add default via " + cfg.gateways[x].ip + " table gw" + (x + 1));
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
        pbuf += "gateway   - Users: " + stat.dhcp.total;
        pbuf += " - Total Connections: " + (stat.conntrack.total - 1) + " |";
        for (let x = 0; x < cfg.gateways.length; x++)
            pbuf += " R" + (x + 1) + ":" + stat.conntrack.gateways[x] + "|";
        gbuf = "gateway   - Modem Status: |";
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
        for (let x = 0; x < cfg.gateways.length; x++) {
            if (stat_nv.avg5Min.gateways[x]!=undefined)
                stat_nv.gateways.pingDropsWan[x]
                    = Math.floor(stat_nv.avg5Min.gateways[x].reduce((a, b) => a + b, 0));
        }
        stat_nv.conntrack[time.min10]
            = Math.floor(stat_nv.avg5Min.conntrack.total.reduce((a, b) => a + b, 0) / 300);
        stat_nv.arp[time.min10] = Math.floor(stat_nv.avg5Min.arp.reduce((a, b) => a + b, 0) / 300);
        file.write.stat();
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
                result[randomString] = { duration: (duration * 60 * 60), speed, multi };
            }
            //const vouchertest = script.voucher.generate(10, 3, 86400, 1, false, true);
            console.log("vouchers - creating " + count + " vouchers with a duration of: " + duration + " hours");
            Object.assign(voucher, result);
            file.write.voucher();
        },
        find: function (code, mac) {  // runs when someone click submit on portal login page
            if (voucher[code] && arp[mac]) {
                if (voucher[code].ip != undefined) {
                    if (voucher[code].multi == 0) {
                        console.log("vouchers - relogin - code: " + code + ", for mac: " + mac + " - clearing old IPs");
                        script.voucher.nft(voucher[code].ip, voucher[code].speed, "delete");
                        voucher[code].ip = [arp[mac].ip];
                        voucher[code].mac = mac;
                        script.voucher.nft(arp[mac].ip, voucher[code].speed, "add");
                    } else if (voucher[code].ip.length <= voucher[code].multi) {
                        console.log("vouchers - relogin - code: " + code + ", for mac: " + mac + " - adding new IP");
                        script.voucher.nft(voucher[code].ip, voucher[code].speed, "add");
                        voucher[code].ip.push(arp[mac].ip)
                        script.voucher.nft(arp[mac].ip, voucher[code].speed, "add");
                    } else console.log("vouchers - relogin - code: " + code + ", for mac: " + mac + " - no more slots, disallowed");
                } else {
                    voucher[code].mac = mac;
                    voucher[code].activated = time.epoch;
                    voucher[code].ip = [arp[mac].ip];
                    // console.log(voucher[code])
                    console.log("vouchers - adding voucher: " + code + ", for mac: " + mac + ", with IP: " + arp[mac].ip
                        + " - expires in: " + (voucher[code].duration / 60) + " min");


                    script.voucher.nft({ [voucher[code].speed]: { ip: arp[mac].ip } }, "add");


                }
                file.write.voucher();
            }
        },
        prune: function () {
            for (const code in voucher) {
                if (voucher[code] != undefined && voucher[code].activated != undefined
                    && time.epoch - voucher[code].activated >= voucher[code].duration) {
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
                + ";  nft " + action + " element ip filter " + cfg.network.speed.macs[speed].name + " { " + ip + " }"
                , (e) => { if (e) console.error(e); });
        },
    },
}
app = {
    nft: {
        create: function (flush) {
            nft = app.nft.command;

            if (flush !== false) {
                console.log("nftables  - flushing all speed limiter tables");
                cfg.network.speed.mac.forEach(element => { nft.flush("filter", element.name); });
            }

            nft.cTable("mangle", "prerouting", "filter", "dstnat", "accept");

            if (cfg.network.speed.mac[1] != undefined) {
                console.log("nftables  - speed - setting global limit");
                nft.delete("filter forward", "speed_unrestricted");
                cp.execSync('nft add chain ip filter speed_limiter');
                nft.add("filter forward", "speed_jump", "jump speed_limiter");
                cp.execSync('nft flush chain ip filter speed_limiter');
                cp.execSync('nft add rule ip filter speed_limiter ct state new ip daddr 0.0.0.0/0 accept');
                nft.speedMAC();
            } else {
                console.log("nftables  - speed - setting no limiters");
                nft.delete("filter forward", "speed_jump");
                nft.add("filter forward", "speed_unrestricted", "ct state related,established ip daddr 0.0.0.0/0 accept");
            }

            if (cfg.network.portal.enabled) {
                if (flush !== false) {
                    nft.flush("nat", "allow");
                    nft.flush("mangle", "allow");
                }
                nft.update("nat prerouting", "nat_portal_redirect_dns", 'ip saddr != @allow udp dport 53 dnat to '
                    + cfg.network.interface[0].ip + ':52');
                nft.update("nat prerouting", "nat_portal_redirect_http", 'ip saddr != @allow tcp dport 88 dnat to '
                    + cfg.network.interface[0].ip + ':80');
                nft.update("nat prerouting", "nat_portal_redirect_https", 'ip saddr != @allow tcp dport 443 dnat to '
                    + cfg.network.interface[0].ip + ':443');
                nft.update('nat postrouting', 'masquerade', 'ip saddr @allow oif "'
                    + ((cfg.network.interface[1]) ? cfg.network.interface[1].if : cfg.network.interface[0].if) + '" masquerade');
            } else {
                console.log("nftables  - creating outbound nat");
                nft.update("nat postrouting", "masquerade", 'ip saddr ' + cfg.network.interface[0].subnetCIDR[0] + '/'
                    + cfg.network.interface[0].subnetCIDR[1] + ' oif "' + ((cfg.network.interface[1])
                        ? cfg.network.interface[1].if : cfg.network.interface[0].if) + '" masquerade');
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

                },
                {
                    rule: {
                        family: "ip",
                        table: "mangle",
                        chain: "prerouting",
                        handle: 3,
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
                                                    addr: "10.10.0.0",
                                                    len: 19
                                                }
                                            },
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
            update: function (chain, name, rule) {
                let handleNum = Number(parse(cp.execSync('nft -a list chain ip ' + chain).toString()
                    , '"nfsense_' + name + '" # handle ', '\n'));
                if (isNaN(handleNum)) {
                    console.log("nftables  - creating rule - " + chain + " - " + name);
                    cp.execSync('nft add rule ip ' + chain + ' ' + rule + ' comment "nfsense_' + name + '"')

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
                for (let x = 0; x < cfg.network.speed.mac.length; x++) {
                    rule = cfg.network.speed.mac[x];
                    if (x != 0) {
                        console.log("nftables  - creating mac based speed limiter rule - " + rule.name);
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
            speedIP: function () {
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
                for (let x = 0; x < cfg.network.speed.mac.length; x++) {
                    rule = cfg.network.speed.mac[x];
                    if (x != 0) {
                        console.log("nftables  - creating mac based speed limiter rule - " + rule.name);
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
    vpn: {
        wireguard: {
            clientConnect: function () {
                for (let x = 0; x < cfg.vpn.wireguard.client.length; x++) {
                    console.log("WireGuard - connecting to site: " + cfg.vpn.wireguard.client[x].name);
                    service(cfg.vpn.wireguard.client[x], x);
                }
                function service(connection, x) {
                    let fileName = path.app + "/tmp/wg" + x + ".conf";
                    let buf = [
                        "[Interface]",
                        "PrivateKey = " + connection.keyPrivate,
                        "Address = " + connection.address,
                        "[Peer]",
                        "PublicKey = " + connection.keyServer,
                        "Endpoint = " + connection.endpoint,
                        "AllowedIPs = " + connection.networks,
                        "PersistentKeepalive = " + connection.keepalive,
                    ]
                    fs.writeFileSync(fileName, buf.join("\n"));
                    cp.exec("wg-quick down wg" + x + "; wg-quick up " + fileName, (e, d) => {
                        if (e) console.log("\nWireguard - " + connection.name + " - error: ", e);
                        else console.log("\nWireguard - " + connection.name + " - successfully connected: ", d);
                        cp.exec("wg show", (e, d) => { console.log(e || "", d) })
                    });
                }
            }
        }
    },
    pingAsync: function (address, result, count, mark) {
        spawn("ping", ["-c 1", address, "-W 2", "-m " + mark], undefined, (data, object) => {         // data is the incoming data from the spawn close event (final data). Obj is the original options sent for the future CB
            stat_nv.avg5Min.gateways[(mark - 1)] = stat_nv.avg5Min.gateways[(mark - 1)] || [];
            if (data.includes("64 bytes from")) {
                object.result[object.count] = Number(parse(data, "time=", " "));
                stat_nv.avg5Min.gateways[(mark - 1)][stat_nv.step5Min] = 0;
            }
            else {
                stat_nv.avg5Min.gateways[(mark - 1)][stat_nv.step5Min] = 1;
                object.result[object.count] = false;
            }
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
                stat.conntrack.gateways[x] = Number(parse(error.toString(), "\\(conntrack-tools\\)", " ", undefined, true));
                //    console.log("Gateway " + (x + 1) + ":" + stat.conntrack.gateways[x]);
                if (print && x == cfg.gateways.length - 1) { app.getConnTotal(true) }
                else if (x < cfg.gateways.length) { x++; get(); }
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
            let buf = { add: {}, delete: {} }, vouchers = {};
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
                        if (user[mac] && user[mac].speed == 0) {
                            console.log("ARP - urestricted user connection - mac: ", mac, " - ip: ", changes.added[mac].ip);
                        }
                        if (cfg.network.portal.enabled == true) {
                            if (user[mac]) {
                                findUser(mac, changes.added[mac].ip, buf.add);
                            }
                        } else { findUser(mac, changes.added[mac].ip, buf.add); }
                        for (const code in voucher) {
                            if (voucher[code] != undefined && voucher[code].mac != undefined && voucher[code].mac == mac) {
                                console.log("vouchers - resuming session - code: " + code + ", for mac: ", mac, ", with IP: ", changes.added[mac].ip);
                                //    if (vouchers[voucher[code].speed] == undefined) vouchers[voucher[code].speed] = { ip: [] }
                                //  vouchers[voucher[code].speed].ip.push(newTable[mac].ip)
                                script.voucher.nft(changes.added[mac].ip, voucher[code].speed, "add");
                            }
                        }
                    }
                    nftUpdate("add", buf.add);
                }
                if (Object.keys(changes.removed).length > 0) {
                    buf.delete = {}
                    for (const mac in changes.removed) {
                        if (cfg.network.portal.enabled == true) {
                            if (user[mac]) findUser(mac, changes.removed[mac].ip, buf.delete);
                        } else findUser(mac, changes.removed[mac].ip, buf.delete);
                    }
                    nftUpdate("delete", buf.delete);
                }
                if (Object.keys(changes.updated).length > 0) {
                    buf.add = {};
                    buf.delete = {};
                    for (const mac in changes.updated) {
                        if (cfg.network.portal.enabled == true) {
                            if (user[mac]) {

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
                let speed;
                if (user == undefined || user[mac] == undefined) speed = "global";
                else speed = cfg.network.speed.mac[user[mac].speed].name;
                if (tbuf[speed] == undefined) tbuf[speed] = { ip: [] }
                tbuf[speed].ip.push(...ip);
            }
        }
        function nftUpdate(type, object) {
            for (const speed in object) {
                if (cfg.log.arp) console.log("nftables  - " + type + " IPs: ", object[speed].ip, " for speed class ", speed);
                cp.exec(" nft " + type + " element ip filter " + speed + " { " + object[speed].ip + " }"
                    + ((cfg.network.portal.enabled) ?
                        " ; nft " + type + " element ip nat allow { " + object[speed].ip + " }" : "")
                    + ((cfg.network.portal.enabled) ?
                        " ; nft " + type + " element ip mangle allow { " + object[speed].ip + " }" : "")
                    , (e) => {
                        if (e) {
                            //  console.log(e);
                            if (e.message.includes("Command failed:  nft add element ip")) {
                                console.log("ARP - flushing NF and ARP tables");
                                app.nft.create(true);
                                script.nft();
                                state.tableFlushes++;
                                arp = {};
                            } else {
                                state.tableRemovalFail++;
                                console.log("ARP - bulk ip address removal failed");
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
            if (cfg.network.portal.enabled == true || cfg.network.speed.mac.length > 0) readArpTable();
            else clearInterval(tate.arpTimer);
        }, cfg.network.arpRefresh);
    },
}
server = {
    web: function () {
        webAdmin.use('/admin', express.static(path.app + '/public'));
        web.use('/admin', express.static(path.app + '/public'));

        //  webPublic.use('/', express.static(path.app + '/monitor'));
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
            res.json(Array.from({ length: 288 }, (_, i) => ({ x: i, y: stat_nv.conntrack[i] })));
        });
        webAdmin.get('/admin', (req, res) => {
            res.sendFile(require('path').join(__dirname, '/public/index.html'));
        });
        webAdmin.get('/data', (req, res) => {
            res.json(Array.from({ length: 288 }, (_, i) => ({ x: i, y: stat_nv.conntrack[i] })));
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
            console.log('webserver - web client accessing portal - ' + clientIp);
            res.sendFile(require('path').join(__dirname, "/public/portal.html"));
        });
        web.get("/diag", (req, res) => {
            res.send({
                state,
                stat,
                stat_nv,
            });
        });
        web.get('/data', (req, res) => {
            res.json(Array.from({ length: 288 }, (_, i) => ({ x: i, y: stat_nv.conntrack[i] })));
        });
        web.get('/test', (req, res) => {
            res.sendFile(require('path').join(__dirname, "/public/data.html"));
        });
        web.get('*', (req, res) => {
            client = req.ip || req.connection.remoteAddress
            const clientIp = client.substring(client.lastIndexOf(":") + 1);
            let host = req.headers.host;

            if (host === "admin." + cfg.services.dns.localDomain
                //  || host === cfg.services.dns.localDomain
            ) {
               // console.log('webserver - web client - ' + clientIp + " - requesting host: "
               //     , host, " forwarding to portal");
                return res.redirect(302, "https://" + cfg.services.dns.localDomain + ":82/admin");
            }
            for (let x = 0; x < cfg.services.web.redirect.length; x++) {
                redirect = cfg.services.web.redirect[x];
                if (x == 0) {
                    if (redirect.target
                        == "change only the target if you dont want portal as the default forward - otherwise leave this string") {
                        if (host === cfg.services.dns.localDomain || host == cfg.network.interface[0].ip) {
                         //   console.log('webserver - web client - ' + clientIp + " - requesting host: "
                           //     , host, " forwarding to admin portal - from redirect list");
                            return res.redirect(302, "http://" + cfg.services.dns.localDomain + "/portal");
                        }
                    }
                }
                if (host === redirect.host) {
               //     console.log('webserver - web client - ' + clientIp + " - requesting host: "
               //         , host, " forwarding to: " + redirect.target);
                    return res.redirect(302, redirect.target);
                }
            }
        //    console.log('webserver - web client - ' + clientIp + " - requesting host: "
          //      , host, " forwarding to: " + "http://" + cfg.services.dns.localDomain + "/portal");
            return res.redirect(302, "http://" + cfg.services.dns.localDomain + "/portal");
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

            ws.send(JSON.stringify({ cfg: { gateways: cfg.gateways } }));

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
    dhcp: function () {
        console.log("system    - starting DHCP server...")
        let buffer = '';
        service();
        services.dhcp = cp.spawn('dhcpd', ['-4', '-f', '-cf', '/etc/dhcp/dhcpd.conf']);
        services.dhcp.stdout.on('data', (chunk) => {  /* console.log("NORMAL DADAT: " + data) */ });
        services.dhcp.stderr.on('data', (chunk) => {
            //  console.log(chunk.toString())
            /* process(chunk);*/
        });
        services.dhcp.on('close', (code) => {
            console.log("system    - dhcpd exited with code: " + code + ", restarting...");
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
        function service() {
            let param = cfg.services.dhcp;
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
            for (let x = 0; x < cfg.services.dhcp.bindings.length; x++) {
                let binding = cfg.services.dhcp.bindings[x];
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
    dnsMasq: function () {        // not in use
        console.log("system    - starting DNS server...")
        service();
        services.dns = cp.spawn('dnsmasq', ['-d', '-C', path.app + '/tmp/dnsmasq.conf']);
        services.dns.stdout.on('data', (data) => { console.log("NORMAL DADA: " + data) });
        services.dns.stderr.on('data', (data) => { console.log("DNS Server: " + data.toString()) });
        services.dns.on('close', (code) => {
            console.log("system    - DNSMasq exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsMasq(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function service() {
            let param = cfg.services.dns;
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
        service();
        services.dns9 = cp.spawn('named', ['-f', '-c', '/etc/bind/named.conf']);
        services.dns9.stdout.on('data', (data) => { console.log("NORMAL DADA: " + data) });
        services.dns9.stderr.on('data', (data) => { console.log("DNS Server: " + data.toString()) });
        services.dns9.on('close', (code, data) => {
            console.log("system    - Bind9 exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsBind9(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function service() {
            let param = cfg.services.dns;
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

            cfg.services.dns.zones[0].domain = cfg.services.dns.localDomain;
            cfg.services.dns.zones[0].nameServer = "ns1." + cfg.services.dns.localDomain + ".";
            cfg.services.dns.zones[0].nameServerAddress = cfg.network.interface[0].ip;
            cfg.services.dns.zones[0].records[0].address = cfg.network.interface[0].ip;
            cfg.services.dns.zones[0].records[1].address = cfg.network.interface[0].ip;

            for (let x = 0; x < cfg.services.dns.zones.length; x++) {
                let zone = cfg.services.dns.zones[x];
                let global = cfg.services.dns.global;
                console.log("DNS       - creating zone for - " + zone.domain);
                let bufZone = [
                    "$TTL\t" + global.ttlS,
                    "@\tIN\tSOA\t" + zone.nameServer + " admin." + zone.domain + ". (",
                    "\t\t\t" + "2025020901" + " ; Serial",
                    "\t\t\t" + global.refresh + " ; Refresh",
                    "\t\t\t" + global.retry + " ; Retry",
                    "\t\t\t" + global.expire + " ; Expire",
                    "\t\t\t" + global.ttlMin + " ) ; Minimum TTL",
                    "\tIN\tNS\t" + zone.nameServer,
                ]
                for (let y = 0; y < cfg.services.dns.zones[x].records.length; y++) {
                    record = cfg.services.dns.zones[x].records[y];
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
    dnsMasqPortal: function () {
        console.log("system    - starting Portal DNS server...")
        service();
        services.dnsPortal = cp.spawn('dnsmasq', ['-d', '-C', path.app + '/tmp/dnsmasq-portal.conf']);
        services.dnsPortal.stdout.on('data', (chunk) => { console.log("NORMAL DADA: " + data) });
        services.dnsPortal.stderr.on('data', (chunk) => {/* process(chunk);*/ });
        services.dnsPortal.on('close', (code) => {
            console.log("system    - DNSMasq (Portal) exited with code: " + code + ", restarting...");
            setTimeout(() => { server.dnsMasqPortal(); }, 3e3);
            cp.exec("killall -9 dnsmasq");
        });
        function service() {
            let param = cfg.network.portal;
            let buf = [
                'interface=' + cfg.network.interface[0].if,
                'address=/#/' + param.dnsServer,
                'port=' + param.dnsServerPort,
            ];
            //  console.log("DNS Service Config: ", buf);
            fs.writeFileSync(path.app + "/tmp/dnsmasq-portal.conf", buf.join("\n"));
        }
    },
};
sys = {
    boot: function () {
        sys.lib();
        sys.checkArgs();
        file.read.cfg();
        sys.init();
        console.log("system    - booting...");
        libLate();
        file.read.voucher();
        file.read.user();
        file.read.stat();

        script.getStatSec();
        script.getStat();


        server.web();
        script.checkRoutes();
        // configure and install nginx on setup, can nginx run inside node?
        app.nft.create();
        if (cfg.network.gateway.startAll) script.nft();
        if (cfg.services.dhcp.enabled) { server.dhcp(); app.getDHCP(); }
        if (cfg.services.dns.enabled) server.dnsBind9();
        if (cfg.network.portal.enabled) server.dnsMasqPortal();
        if (cfg.vpn.wireguard.client.length > 0) app.vpn.wireguard.clientConnect();

        app.getConGateways(true);
        if (cfg.network.portal.enabled || cfg.network.speed.mac.length > 0) {
            console.log("system    - starting ARP tracker")
            app.getArp(cfg.network.interface[0].if);
        }
        if (cfg.monitor.lan.enable) script.pingLan();
        script.pingWanRound();



        setInterval(() => {
            script.gatewayMonitor();
            app.systemInfo();
            script.getStatSec();
        }, 1e3);
        setInterval(() => {
            app.getConnTotal();
            script.voucher.prune();
            if (cfg.services.dhcp.enabled) app.getDHCP();
            script.getStat();
        }, 60e3);
        setInterval(() => { app.getConGateways(); }, 300e3);
        console.log("system    - setting network timeouts");
        cp.execSync("echo " + cfg.network.arpTimeout + " > /proc/sys/net/ipv4/neigh/default/gc_stale_time");
        cp.execSync("sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=" + cfg.network.socketTimeout);
    },
    init: function () {
        services = {};
        stat_nv = {
            conntrack: [],
        };
        user = {};
        voucher = {};
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
            gateways: [],
            nfTables: {
                timer: null,        // gateway update wait timer
                mangle: undefined,  // mangle rule handle number
            },
            conntrack: {
                totalMin: [],
            },
            dhcp: {
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
        try { cp.execSync("mkdir " + path.app + "/tmp"); } catch { }
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
                this.month = date.getMonth() + 1;   // 0 based
                this.day = date.getDate();          // not 0 based
                this.dow = date.getDay() + 1;       // 0 based
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
            write: {
                cfg: function () {
                    clearTimeout(state.file.timer.cfg);
                    state.file.timer.cfg = setTimeout(() => {
                        console.log("system    - saving config data to: " + path.app + 'nfsense-config.tmp');
                        fs.writeFile(path.app + 'nfsense-config.tmp', JSON.stringify(config, null, 2), 'utf-8', (e) => {
                            cp.exec("cp " + path.app + 'nfsense-config.tmp ' + path.app + 'nfsense-config.json', () => { });
                        })
                    }, 5e3);
                },
                user: function () {
                    clearTimeout(state.file.timer.user);
                    state.file.timer.user = setTimeout(() => {
                        console.log("system    - saving user data to: " + path.app + 'nfsense-user.tmp');
                        fs.writeFile(path.app + 'nfsense-user.tmp', JSON.stringify(user, null, 2), 'utf-8', (e) => {
                            cp.exec("cp " + path.app + 'nfsense-user.tmp ' + path.app + 'nfsense-user.json', () => { });
                        })
                    }, 5e3);
                },
                voucher: function () {
                    clearTimeout(state.file.timer.voucher);
                    state.file.timer.voucher = setTimeout(() => {
                        console.log("system    - saving voucher data to: " + path.app + 'nfsense-voucher.tmp');
                        fs.writeFile(path.app + 'nfsense-voucher.tmp', JSON.stringify(voucher, null, 2), 'utf-8', (e) => {
                            cp.exec("cp " + path.app + 'nfsense-voucher.tmp ' + path.app + 'nfsense-voucher.json', () => { });
                        })
                    }, 3e3);
                },
                stat: function () {
                    //    console.log("system    - saving stat data to: " + path.app + 'nfsense-stat.tmp');
                    fs.writeFile(path.app + 'nfsense-stat.tmp', JSON.stringify(stat_nv, null, 2), 'utf-8', (e) => {
                        cp.exec("cp " + path.app + 'nfsense-stat.tmp ' + path.app + 'nfsense-stat.json', () => { });
                    })
                }
            },
            read: {
                cfg: function () {
                    try {
                        console.log("system    - loading config data");
                        cfg = JSON.parse(fs.readFileSync(path.app + "nfsense-config.json", 'utf8'));
                    } catch (e) {
                        console.log(e)
                        console.log("cfg file does not exist, exiting");
                        process.exit();
                    }
                },
                user: function () {
                    try {
                        console.log("system    - loading user data");
                        user = JSON.parse(fs.readFileSync(path.app + "nfsense-user.json", 'utf8'));
                        //   console.log(user);
                    } catch {
                        console.log("system    - user file does not exist, creating");
                        fs.writeFileSync(path.app + "nfsense-user.json", JSON.stringify(user));
                    }
                },
                voucher: function () {
                    try {
                        console.log("system    - loading voucher data");
                        voucher = JSON.parse(fs.readFileSync(path.app + "nfsense-voucher.json", 'utf8'));
                        //   console.log(voucher);
                    } catch {
                        console.log("system    - voucher file does not exist, creating");
                        fs.writeFileSync(path.app + "nfsense-voucher.json", JSON.stringify(voucher));
                    }
                },
                stat: function () {
                    try {
                        console.log("system    - loading stat data");
                        stat_nv = JSON.parse(fs.readFileSync(path.app + "nfsense-stat.json", 'utf8'));
                        //   console.log(stat);
                    } catch {
                        console.log("system    - stat file does not exist, creating");
                        fs.writeFileSync(path.app + "nfsense-stat.json", JSON.stringify(stat_nv));
                    }
                },
            }
        };
        libLate = function () {
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
            eWeb.listen(80, () => console.log('webserver - Redirect server running on port 80'));
            eWebPublic.listen(83, () => console.log('webserver - Redirect server running on port 80'));
            eWebAdmin.listen(82, () => console.log('webserver - HTTP admin web server running on port 82'));
            eWebSecure.listen(443, () => console.log('webserver - HTTPS admin web server running on port 443'));
        };
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

