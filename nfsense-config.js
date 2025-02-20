{
    "log": {
        "arp": true,
        "dns": false,
        "dhcp": false
    },
    "stat": {
        "network": {
            "avg": 5
        },
        "cpuAvg": 20
    },
    "vpn": {
        "wireguard": {
            "client": [
                {
                    "name": "Elite",
                    "endpoint": "vpn.-------.com:1020",
                    "keyPrivate": "-+-/----=",
                    "keyPublic": "--+----=",
                    "keyServer": "---------=",
                    "address": "10.255.0.2/24",
                    "networks": "10.255.0.0/24, 10.21.88.0/24, 172.16.255.0/24, 10.22.0.0/23, 10.21.55.0/24",
                    "keepalive": 25
                }
        }
    },
    "network": {
        "socketTimeout": 43200,
        "arpTimeout": 120,
        "arpRefresh": 1000,
        "saccaraServer": "10.21.88.2",
        "gateway": {
            "mode": "teaming",
            "failAll": true,
            "startAll": true,
            "weighted": false
        },
        "portal": {
            "enabled": true,
            "interface": 0
        },
        "interface": [
            {
                "name": "lan",
                "if": "ens1",
                "subnetCIDR": [
                    "10.10.0.0",
                    19
                ],
                "ip": "10.10.0.12"
            }
        ],
        "speed": {
            "mac": [
                {
                    "name": "unrestricted"
                },
                {
                    "name": "guest",
                    "up": 5000,
                    "upBurst": 8000,
                    "down": 5000,
                    "downBurst": 8000
                },
                {
                    "name": "global",
                    "up": 500,
                    "upBurst": 800,
                    "down": 500,
                    "downBurst": 800
                }
            ],
            "ip": []
        }
    },
    "services": {
        "web": {
            "port": 80,
            "adminPort": 82,
            "redirect": [
                {
                    "host": "default - do not remove",
                    "target": "change only the target if you dont want portal as the default forward - otherwise leave this string"
                },
                {
                    "host": "laundry.daren",
                    "target": "http://laundry.daren:2000"
                }
            ]
        },
        "telegram": {
            "enabled": true,
            "token": "----------",
            "admins": [
                6176063468
            ]
        },
        "dhcp": {
            "enabled": false,
            "subnet": "10.10.0.0",
            "mask": "255.255.224.0",
            "rangeStart": "10.10.8.1",
            "rangeEnd": "10.10.12.255",
            "nameServer": "10.10.0.1",
            "router": "10.10.0.1",
            "broadcast": "10.10.31.255",
            "domain": "thwerks.com",
            "leaseDefault": 600,
            "leaseMax": 600,
            "blockUnknown": true,
            "bindings": [
                {
                    "name": "-----",
                    "mac": "a0:--:85:--:e7:--",
                    "ip": "10.10.0.13"
                }
            ]
        },
        "dns": {
            "enabled": true,
            "localDomain": "usfw",
            "cacheSize": 500000,
            "cacheTTLmin": 90,
            "cacheTTLmax": 604800,
            "cacheNegative": true,
            "cacheTTLneg": 86400,
            "cacheSizeMB": 512,
            "forwarders": [
                "1.1.1.3",
                "208.67.222.123"
            ],
            "global": {
                "ttlS": 86400,
                "ttlMin": 86400,
                "refresh": 3600,
                "retry": 1800,
                "expire": 1209600
            },
            "zones": [
                {
                    "domain": "internal use - do not remove",
                    "nameServer": "internal use - do not remove",
                    "nameServerAddress": "internal use - do not remove",
                    "records": [
                        {
                            "prefix": "",
                            "type": "A",
                            "address": "internal use - do not remove"
                        },
                        {
                            "prefix": "admin",
                            "type": "A",
                            "address": "internal use - do not remove"
                        }
                    ]
                },
                {
                    "domain": "---.-----",
                    "nameServer": "ns1.----.----.",
                    "nameServerAddress": "10.10.0.1",
                    "records": [
                        {
                            "prefix": "",
                            "type": "A",
                            "address": "10.10.0.1"
                        }
                    ]
                }
            ]
        }
    },
    "gateways": [
        {
            "name": "Jesmark",
            "ip": "172.16.10.1",
            "weight": 10
        },
        {
            "name": "Cartegena",
            "ip": "172.16.10.3",
            "weight": 10
        }
    ],
    "monitor": {
        "reconnect": 5,
        "upstreamHops": 3,
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
            "samples": 4,
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
    }
}
