{
    "log": {
        "arp": false,
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
            "server": [
                {
                    "name": "remote sites",
                    "enabled": false,
                    "port": 1020,
                    "keyPrivate": "---------",
                    "keyPublic": "---------",
                    "peers": [
                        {
                            "name": "Brgy2",
                            "keyPublic": "---------",
                            "networks": [
                                "10.255.0.2/32",
                                "10.10.0.0/22"
                            ]
                        },
                        {
                            "name": "Abba",
                            "keyPublic": "---------",
                            "networks": [
                                "10.255.0.3/32",
                                "10.21.55.0/24"
                            ]
                        },
                        {
                            "name": "GWIS",
                            "keyPublic": "---------",
                            "networks": [
                                "10.255.0.4/32",
                                "10.11.0.0/21"
                            ]
                        },
                        {
                            "name": "Mambaroto",
                            "keyPublic": "---------",
                            "networks": [
                                "10.255.0.5/32",
                                "10.21.0.0/23"
                            ]
                        }
                    ]
                }
            ],
            "client": [
                {
                    "name": "Elite",
                    "enabled": false,
                    "endpoint": "vpn.------.com:1020",
                    "keyPrivate": "---------",
                    "keyPublic": "---------",
                    "keyServer": "---------",
                    "address": "10.255.0.2/24",
                    "networks": "10.255.0.0/24, 10.21.88.0/24, 10.22.0.0/23, 10.21.0.0/23, 10.21.55.0/24",
                    "keepalive": 60,
                    "keepaliveAddress": "10.255.0.1",
                    "reconnect": 10
                }
            ]
        }
    },
    "network": {
        "manager": "ifupdown",
        "socketTimeout": 43200,
        "arpTimeout": 600,
        "arpRefresh": 1000,
        "gateway": {
            "mode": "failover",
            "failAll": true,
            "startAll": true,
            "weighted": false
        },
        "restrict": {
            "dns": [
                "1.1.1.3",
                "1.0.0.3",
                "208.67.222.123"
            ]
        },
        "interface": [
            {
                "name": "lan",
                "if": "ens1",
                "subnetCIDR": [
                    "10.10.0.0",
                    24
                ],
                "ip": "10.10.0.12"
            },
            {
                "name": "wan",
                "if": "ens1"
            }
        ],
        "speed": {
            "mac": [
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
                    "name": "guest",
                    "up": 5000,
                    "upBurst": 8000,
                    "down": 5000,
                    "downBurst": 8000
                }
            ],
            "ip": []
        }
    },
    "service": {
        "web": {
            "port": 80,
            "adminPort": 82,
            "redirect": [
                {
                    "host": "default - do not remove",
                    "target": "change only the target if you dont want portal as the default forward - otherwise leave this string"
                }
            ]
        },
        "telegram": {
            "enabled": false,
            "token": "---------",
            "admins": [
                6176063468
            ]
        },
        "portal": {
            "enabled": true,
            "interface": 0,
            "codeLength": 4,
            "guest": {
                "duration": 2880,
                "hardLimit": false,
                "disallowExtension": false,
                "lockoutPeriod": 30
            }
        },
        "dhcp": {
            "enabled": false,
            "subnet": "10.21.55.0",
            "mask": "255.255.255.0",
            "rangeStart": "10.21.55.100",
            "rangeEnd": "10.21.55.254",
            "nameServer": "10.21.55.10",
            "router": "10.21.55.10",
            "broadcast": "10.21.55.255",
            "domain": "thwerks.com",
            "leaseDefault": 86400,
            "leaseMax": 86400,
            "blockUnknown": false,
            "bindings": []
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
                    "domain": "thwerks.com",
                    "nameServer": "nsfw.",
                    "nameServerAddress": "10.10.0.12",
                    "records": [
                        {
                            "prefix": "",
                            "type": "A",
                            "address": "199.231.113.38"
                        },
                        {
                            "prefix": "usfw",
                            "type": "A",
                            "address": "10.10.0.12"
                        },
                        {
                            "prefix": "vpn",
                            "type": "A",
                            "address": "199.231.113.38"
                        }
                    ]
                }
            ]
        }
    },
    "gateways": [
        {
            "name": "PLDT",
            "ip": "192.168.1.1"
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
            "interval": 10,
            "samples": 4,
            "delay": 1000,
            "latencyWarn": 800,
            "latencyError": 1500,
            "lossWarn": 50,
            "lossError": 80,
            "targets": [
                "8.8.8.8",
                "1.1.1.1"
            ]
        }
    }
}
