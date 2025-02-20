## nfSense firewall for linux

### What is It:
  - this is a web based internet firewall solution like pfSense but for Linux
  - its still an early development
  - it is designed for public access wifi, schools, or environments with heavy captive portal, speed control and bandwitch requirements.
  - it can heavily restrict internet speed but still produce a quality user experience do to burst speed modes
  - great for Starlink and aggrigated modem/router setups, WISPs 

### Features:
  - based on nfTables, ISC DHCP and Bind9
  - built for Debian 12 and NodeJS 22
  - MAC based speed limiting, speed bursting
  - MAC based netwrok access control
  - captive portal, voucher generator 
  - load balancing and failover
  - web based traffic, network performance and connection monitoring
  - quorum based gateway monitoring
  - efortless setup, no complex installation steps
  - connection stats, like active DHCP and portal users, sockets per gateway and detailed gateway performance monitoring
  - intellegent gateway switchover and aggrigation, smart loadbalancing
  - VPN concentration and hairpinning

### Captive Portal Features:
  - per voucher speed control
  - generate vouchers as needed usint Telegram bot
  - can set voucher code length, duration, speed and allowed logins
  - can add permanant portal passthrough via telegram
  - quickly get mac address and IP via portal secret code
  - portal feature help request submisstion via Telegram bot

### Unique Capabilities:
  - have multiple redundant gateways all on one (or more) interface
  - router on a stick (single interface routing)
  - have mutilple network speed profiles based on MAC address
  - good performance with Realtek network interfaces (unlike pfsense)
  - have a single onsite device as both server and router with needing a VM; saves energy and hardware budget

### In Development:
 - user based network login
 - web interface for firewall rules
 - web interface for VPN management
 - Telegram notification
 - nGinx integration
 - local DNS zones
 - clustering and hot failover
