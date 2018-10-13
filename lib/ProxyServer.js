const net = require('net')
const axios = require('axios')
const qs = require('querystring')
const helper = require('./helper')
const logger = helper.getLogger('ProxyServer')

const STATUS = { closed: 0, ready: 1, piped: 2 }
const setListener = (sock, onClose) => {
  sock.on('error', function () {
    try {
      this.end()
    } catch (e) {}
  })
  sock.on('close', function () {
    if (onClose) return onClose()

    if (this.pipeSock) {
      this.status = STATUS.closed
      this.pipeSock.end()
    } else {
      this.status = STATUS.closed
    }
  })
}

class ProxyServer {
  constructor (config) {
    this.config = config
  }

  close (sock, reason) {
    logger.info(`[close][${sock.id}] ${reason}.`)
    sock.end(reason)
  }

  async makeTcpConnect () {
    logger.debug('Making TCP Connection')
    return new Promise((resolve, reject) => {
      const { port, host } = this.config.gateway
      const socket = net.connect(port, host, function () {
        resolve(socket)
      })

      setListener(socket, reject)
    })
  }

  async connect () {
    let { backend } = this.config

    let res = await axios.get(`${this.config.api}/status`)
    let { current, backends = [] } = res.data
    if (current === backend) {
      logger.debug('Current backend matched.')
      return this.makeTcpConnect()
    }

    if (!backends.includes(backend)) {
      logger.debug('Backend is not in the list. Try authentication.')
      let { authentication: { method, params } } = this.config
      res = await axios.get(`${this.config.api}/auth/${method}?${qs.stringify(params)}`)

      if (typeof res.data === 'string') {
        throw new Error(`Authentication failed: ${res.data}`)
      }

      backends = res.data.backends || []
      if (!backends.includes(backend)) {
        throw new Error(`Authentication failed: Backend ${backend} cannot be acquired.`)
      }
    }

    logger.debug('Selecting backend')
    res = await axios.get(`${this.config.api}/select?${qs.stringify({ backend })}`)
    if (typeof res.data === 'string' || res.data.current !== backend) {
      throw new Error(`Selecting backend failed: ${res.data}`)
    }

    let socket = await this.makeTcpConnect()
    if (current) {
      // set to previous backend
      await axios.get(`${this.config.api}/select?${qs.stringify({ backend: current })}`)
    }
    return socket
  }

  handler (sock) {
    sock.id = `${sock.remoteAddress}:${sock.remotePort}`
    sock.status = STATUS.ready

    logger.debug(`[${sock.id}] Connected.`)
    setListener(sock, () => {
      logger.info(`[${sock.id}] Closed.`)
    })

    this.connect().then(backendSocket => {
      backendSocket.status = STATUS.ready
      if (sock.status === STATUS.ready) {
        logger.info(`[${sock.id}] Piped to remote backend: ${this.config.backend}`)
        backendSocket.pipe(sock)
        sock.pipe(backendSocket)

        backendSocket.pipeSock = sock
        sock.pipeSock = backendSocket
      } else {
        try { backendSocket.end(); sock.end() } catch (e) {}
      }
    }).catch((e) => {
      logger.error('Error connecting to remote: ', e)
      sock.end()
    })
  }

  listen ({ port, host }) {
    this.server = net.createServer(this.handler.bind(this)).listen(port, host, function () {
      logger.info(`Listening at ${host}:${port}`)
    })
  }
}

module.exports = ProxyServer
