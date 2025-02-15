{
    "stat": {
        "network": {
            "avg": 5
        },
        "cpuAvg": 20
    },
    "network": {
        "manager": "ifupdown",
        "socketTimeout": 43200,
        "gateway": {
            "mode": "team",
            "failAll": true,
            "startAll": true,
            "weighted": false
        },
        "interface": [
            {
                "name": "lan",
                "if": "enp1s0f1",
                "subnet": "10.10.0.0/19",
                "ip": "10.10.0.1"
            },
            {
                "name": "wan",
                "if": "enp1s0f0"
            }
        ],
        "services": {
            "portal": {
                "enabled": false,
                "dnsServer": "10.10.0.12",
                "dnsServerPort": 52
            },
            "dhcp": {
                "enabled": true,
                "subnet": "10.10.0.0",
                "mask": "255.255.224.0",
                "rangeStart": "10.10.13.1",
                "rangeEnd": "10.10.30.255",
                "nameServer": "10.10.0.1",
                "router": "10.10.0.1",
                "broadcast": "10.10.31.255",
                "domain": "thwerks.com",
                "leaseDefault": 600,
                "leaseMax": 600,
                "blockUnknown": false
            },
            "dns": {
                "enabled": true,
                "cacheSize": 500000,
                "cacheTTLmin": 90,
                "cacheTTLmax": 604800,
                "cacheNegative": true,
                "cacheTTLneg": 86400,
                "cacheSizeMB": 512,
                "forwarders": [
                    "1.1.1.3",
                    "208.67.222.123"
                ]
            }
        }
    },
    "gateways": [
        {
            "name": "Jesmark",
            "ip": "172.16.10.1",
            "weight": 10,
            "comment": [],
            "uncomment": []
        },
        {
            "name": "Cartegena",
            "ip": "172.16.10.3",
            "weight": 10
        },
        {
            "name": "Dan",
            "ip": "172.16.10.4",
            "weight": 10
        },
        {
            "name": "Hablato",
            "ip": "172.16.10.5",
            "weight": 10
        },
        {
            "name": "Randall",
            "ip": "172.16.10.6",
            "weight": 10
        },
        {
            "name": "Tim",
            "ip": "172.16.10.7",
            "weight": 10
        },
        {
            "name": "Sandy",
            "ip": "172.16.10.10",
            "weight": 10
        }
    ],
    "monitor": {
        "reconnect": 5,
        "lan": {
            "enable": false,
            "interval": 0,
            "samples": 6,
            "delay": 1000,
            "latencyWarn": 800,
            "latencyError": 1500,
            "lossWarn": 50,
            "lossError": 80,
            "reconnect": null
        },
        "wan": {
            "interval": 0,
            "samples": 1,
            "delay": 1000,
            "latencyWarn": 800,
            "latencyError": 1500,
            "lossWarn": 50,
            "lossError": 80,
            "targets": [
                "8.8.8.8",
                "1.1.1.1",
                "199.231.113.38"
            ]
        }
    },
    "nft": {
        "speed": [
            {
                "name": "unrestricted"
            },
            {
                "name": "global",
                "up": 5000,
                "upBurst": 8000,
                "down": 5000,
                "downBurst": 8000
            },
            {
                "name": "test",
                "up": 500,
                "upBurst": 800,
                "down": 500,
                "downBurst": 800
            }
        ]
    },
    "setup": {}
}
