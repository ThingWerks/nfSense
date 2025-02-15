## nfSense firewall for linux

#### What is It:
  - this is a web based internet firewall solution like pfSense but for Linux
  - its still an early development
  - it is designed for public access wifi, schools, or environments with heavy captive portal, speed control and bandwitch requirement.
  - it can heavily restrict internet speed but still produce a nice user experience do to bust speed modes

#### Features:
  - based on nfTables, ISC DHCP and Bind0
  - built for Debian 12 and NodeJS 22
  - MAC based speed limiting, speed bursting
  - MAC based netwrok access control
  - captive portal, voucher generator 
  - load balancing and failover
  - web base traffic and connections monitoring
  - network performance monitoring 
  - quorum based gateway monitoring
  - quick setup, no complex installation

#### Unique Capabilities:
  - have multiple redundant gateways all on one or more interfaces
  - router on a stick
  - have mutilple speed profiles based on MAC address
  - VPN concentration and hairpinning

#### In Development:
 - user based network
 - web interface for firewall rules
 - web interface for VPN management
 - Telegram notification
 - nGinx integration
 - local DNS zones
