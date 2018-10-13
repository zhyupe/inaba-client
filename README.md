# inaba-client
Inaba Client is a local proxy server for inaba. It will handle authentication and backend-selection for each connection.

## How-to
Create your own `config.json` from `config.example.json`, and start it with `screen` or `pm2` or whatever.

If configured correctly, the backend service should be available at `<local.host>:<local.port>`.

## License
[GNU General Public License v2.0](LICENSE)
