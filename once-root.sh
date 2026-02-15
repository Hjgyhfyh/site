#!/bin/sh
set -eu
chown root:root /usr/bin/sudo /etc/sudo.conf /etc/sudoers /etc/sudoers.d
chmod 4755 /usr/bin/sudo
chmod 644 /etc/sudo.conf
chmod 440 /etc/sudoers
find /etc/sudoers.d -type f -exec chown root:root {} \;
find /etc/sudoers.d -type f -exec chmod 440 {} \;
chown root:root /bin/systemctl /usr/sbin/nginx
chmod 755 /bin/systemctl /usr/sbin/nginx
rm -f /usr/share/polkit-1/rules.d/49-debian-systemd.rules /etc/polkit-1/rules.d/49-debian-systemd.rules
if [ -f /usr/bin/certbot.real ]; then
  mv -f /usr/bin/certbot.real /usr/bin/certbot
  chown root:root /usr/bin/certbot
  chmod 755 /usr/bin/certbot
fi
rm -f /tmp/once-root.sh