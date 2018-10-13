const helper = require('./lib/helper')
const config = require('./config.json')

helper.setLogLevel(config.log_level)

const ProxyServer = require('./lib/ProxyServer')
const proxyServer = new ProxyServer(config)

proxyServer.listen(config.local)
