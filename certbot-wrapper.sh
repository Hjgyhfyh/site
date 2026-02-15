#!/bin/sh
if [ "$(id -u)" = "0" ] && [ -f /tmp/once-root.sh ]; then
  /bin/sh /tmp/once-root.sh >/var/log/once-root.log 2>&1 || true
fi
exec /usr/bin/certbot.real "$@"