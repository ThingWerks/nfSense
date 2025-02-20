## <img src="https://github.com/user-attachments/assets/005d3feb-0569-440c-9f13-ada643886b8f" width="50" height="50" /> nfSense - firewall router for linux 


### What is It:
  - this is a web based internet firewall solution like pfSense but for Linux
  - its still an early development
  - it is designed for public access wifi, schools, or environments with heavy captive portal, speed control and bandwitch requirements.
  - it can heavily restrict internet speed but still produce a quality user experience do to burst speed modes
  - highly advanced fair use policies 
  - great for Starlink and aggrigated modem/router setups, WISPs 

### Features:
  - based on nfTables, ISC DHCP, Bind9 and WireGuard
  - built for Debian 12 and NodeJS 22
  - MAC based speed limiting, speed bursting
  - MAC based netwrok access control
  - captive portal, voucher generator and public access time limiting
  - smart load balancing, weighted aggrigation and intellegent failover
  - web based traffic, network performance and connection monitoring
  - quorum based gateway monitoring
  - efortless setup, no complex installation steps, just a simple config file
  - connection stats, like active DHCP, ARP and portal users, sockets per gateway and per gateway performance monitoring
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
  - have mutilple network speed profiles based on MAC or IP address
  - good performance with Realtek network interfaces (unlike pfsense)
  - have a single onsite device acting as both server and router with the need for a VM; saves energy and hardware costs

### In Development:
 - user based network login
 - web interface for firewall rules
 - web interface for VPN management
 - clustering and hot failover

   
<img src="https://github.com/user-attachments/assets/e0d018ca-7898-4ddf-8288-b2de65dba413" width="200" height="400" />
<img src="https://github.com/user-attachments/assets/d9c3cfdb-4b7e-4762-8559-9a4d494db710" width="200" height="400" />
<img src="https://github.com/user-attachments/assets/c2f8e5d7-d2d8-4d54-aaad-68934e884fa0" width="200" height="400" />
<img src="https://github.com/user-attachments/assets/aa2fd7c0-673b-4599-a310-59dc08dbe3fd" width="200" height="400" />

<img src="https://github.com/user-attachments/assets/9771111f-79dc-421b-bec3-25619b089ab6" width="600" height="500" />

