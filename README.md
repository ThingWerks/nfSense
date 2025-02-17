## nfSense firewall for linux

#### What is It:
  - this is a web based internet firewall solution like pfSense but for Linux
  - its still an early development
  - it is designed for public access wifi, schools, or environments with heavy captive portal, speed control and bandwitch requirements.
  - it can heavily restrict internet speed but still produce a quality user experience do to burst speed modes
  - great for Starlink and aggrigated modem/router setups, WISPs 

#### Features:
  - based on nfTables, ISC DHCP and Bind9
  - built for Debian 12 and NodeJS 22
  - MAC based speed limiting, speed bursting
  - MAC based netwrok access control
  - captive portal, voucher generator 
  - load balancing and failover
  - web base traffic and connections monitoring
  - network performance monitoring 
  - quorum based gateway monitoring
  - efortless setup, no complex installation steps
  - connection stats, like active DHCP and portal users, open sockets per gateway and detailed gateway performance monitoring
  - intellegent gateway switchover and aggrigation, smart loadbalancing

#### Unique Capabilities:
  - have multiple redundant gateways all on one or more interfaces
  - router on a stick
  - have mutilple network speed profiles based on MAC address
  - VPN concentration and hairpinning
  - use a single onsite device as bosth a server and router without the performance hit of running pfsense in a VM

#### In Development:
 - user based network login
 - web interface for firewall rules
 - web interface for VPN management
 - Telegram notification
 - nGinx integration
 - local DNS zones
 - clustering and hot failover
