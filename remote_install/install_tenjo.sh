#!/usr/bin/env bash
set -e

export LOG_FILE=/tmp/install.log

INSTALL_DIR=/opt/hyper-machine
GIT_REPOSITORY=https://github.com/weequan93/lamassu-machine.git
GIT_BRANCH=hyper-7.5.2-wip

DATA_DIR=/opt/hyper-machine/data
DATA_DIR_HYPER_DB=/opt/hyper-machine/data/tx-hyperdb
FRONT_END_DOWNLOAD=https://atm-frontend.s3.ap-south-1.amazonaws.com/default/build.zip
BROWSER_DIR=/opt/hyper-browser
BROWSER_SERVER_DIR=/opt/hyper-server-browser

decho () {
  echo `date +"%H:%M:%S"` $1
  echo `date +"%H:%M:%S"` $1 >> $LOG_FILE
}

cat <<'FIG'
HYPER BC
FIG

echo

while :
do
  read -p "Before starting, please insert your atm no for further registration: " atmno
  if [ -z "$atmno" ]
  then
    echo -e 'atm no cannot be blank, please try again.'
  elif ! [[ "$atmno" =~ ^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$ ]]
  then 
    echo -e "Invalid atm no format, please try again."
  else 
    break
  fi
done

echo -e "\nStarting \033[1mhyper-server\033[0m install. This will take a few minutes...\n"

if [ "$(whoami)" != "root" ]; then
  echo -e "This script has to be run as \033[1mroot\033[0m user."
  echo
  exit 3
fi

git clone "$GIT_REPOSITORY" "$INSTALL_DIR"
cd "$INSTALL_DIR"

git checkout "$GIT_BRANCH"
decho "current working directory = $pwd"
decho "Installing hyper-machine ..."
retry 3 npm install >> $LOG_FILE 2>&1

decho "Generating config file for hyper-machine tenjo ..."
mkdir -p $DATA_DIR
mkdir -p $DATA_DIR_HYPER_DB

cat <<EOF > $INSTALL_DIR/device_config.json
{
  "cryptomatModel": "tejo",
  "brain": {
    "freeMemRatio": 0.01,
    "powerStatus": null,
    "dataPath": "data",
    "wifiConfigPath": null,
    "nfcReader": null,
    "wifiDisabled": true
  },
  "kioskPrinter": {
    "model": "Nippon-2511D-2",
    "address": "/dev/ttyJ4"
  },
  "compliance": {
    "paperWallet": false
  },
  "frontFacingCamera": {
    "device": "/dev/video-front",
    "facephoto": {
      "width": 1280,
      "height": 720,
      "threshold": 20,
      "minFaceSize": 180
    }
  },
  "scanner": {
    "testnet": false,
    "device": "/dev/video-scan",
    "qr": {
      "width": 640,
      "height": 480
    },
    "photoId": {
      "width": 1280,
      "height": 720,
      "threshold": 20,
      "minFaceSize": 180
    }
  },
  "wifi": {
    "wpa": {
      "socket": null
    }
  },
  "billValidator": {
    "rs232": {
      "device": "/dev/ttyJ5"
    }
  },
  "billDispenser": {
    "fiatCode": "usd",
    "model": "f56",
    "device": "/dev/ttyJ7",
    "cassettes": "4"
  },
  "updater": {
    "caFile": "/opt/certs/lamassu.pem",
    "downloadDir": "/tmp/download",
    "extractDir": "/tmp/extract",
    "extractor": {
      "lamassuPubKeyFile": "/opt/certs/lamassu.pub.key"
    },
    "packageJsonDir": "/opt/lamassu-machine"
  }
}
EOF

cat <<EOF > $DATA_DIR/connection-info.json
{
  "host": "localhost",
  "ATM-Number": "$atmno",
  "atmhost": "atm.legenddigital.co",
  "ca": "-----BEGIN CERTIFICATE-----\nMIIFNjCCAx4CCQDZBcNad1sx5jANBgkqhkiG9w0BAQsFADBdMQswCQYDVQQGEwJJ\nUzESMBAGA1UEBwwJUmV5a2phdmlrMRwwGgYDVQQKDBNMYW1hc3N1IE9wZXJhdG9y\nIENBMRwwGgYDVQQDDBNsYW1hc3N1LW9wZXJhdG9yLmlzMB4XDTIyMDgxMjExMTUx\nNFoXDTMyMDUxMTExMTUxNFowXTELMAkGA1UEBhMCSVMxEjAQBgNVBAcMCVJleWtq\nYXZpazEcMBoGA1UECgwTTGFtYXNzdSBPcGVyYXRvciBDQTEcMBoGA1UEAwwTbGFt\nYXNzdS1vcGVyYXRvci5pczCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIB\nAKitRstM2/Gyw9UkqX2Uc/4cLqLH0rHJFzx6vABw8ZMMOVJwIw2iWg09n/shxUV2\nwaCbGSF40fuJ+tTKBSudEwAr72OLcUnNCf9Di2ZdQh9mY73p3jLTir2iMAmJCrg+\nRyY+93SrYgmrOL1ihrnXG3rV2S6CxxTznBkb+g0lqwksQ1a5CCP1/2ndFA2ST1r6\nOsdc7LChHJuzFPl4e/lslEQok3q2A9f91rajhRcbe6WAGABS9oW9zg1MBBgh5/X5\nBwaLHeQZ91lG0VrBZPR7QVP0MXqEgNyp4O4BPy7uZWnozBqNhw9sfT5V8JI1VOch\nS3BOia/A4D+Fjw06HNyCJIaO2YS/yZjgJg7j5LZ2cgR9IWmUcAORxR19IFlsscyW\nzJQtzhe/GyBm/nhHnIq08NnJIH2BsXxG8JrjIweHXtfKF4s4LcCqvvjF/TOgKF2r\n+SeMa1WyuYkcE8Xe4aOMEn3FSLq7/tYnrDAVBhOkFyucBO+6qCilR0qC37T1iIwe\n15JAVHgMUtn2hhwFkqoNPmRDXcyNAxQylT9MuqqCeXMJ9dd2oT8/Be3wRVgwP5WC\nG8HVYCUAFFHVVNePdtF2KjweeHQZu9SH5iq4bNlR7TjiBmafjdnWTzebeE6ZUWjE\nCzpwvaoYSl+HTpjWZmJubdDiNYEvVug3SRcp63HzXH0FAgMBAAEwDQYJKoZIhvcN\nAQELBQADggIBACQDp35s9FYGqEc+q8ctwKgNcmvKfaJOaSmK23SdIks3BCoEPf/O\n1CCxN9u39ghr+ixR1sbBdHfrgJvW/yNdwynRJ5Z6+/5LSGiKzS35dg6KEG/n0AkE\nGJWVWVL5rccc5CjIfsviM59yTF/BM30jZu2QfdZP6x5ObxYXOa7xpzHM3dEYFEjG\ny+2hL34Kl/7mFReaFCU+SpcwE/uR70s3MC6PnXp4emEFv6wyvO4q39zcwRqfpaw4\niYkvmHbpNUszE05kKjjPEeFBqhaVyqqOBRx1Adsjkk+Ibm6vwogcn1LKdCvsPPAC\nDAYunzi5R4W4qLyJTcDvhXqgHj4L3+iZkWq9PC/ezNE13ioakpasoXaXbHFq9vck\nPrYg9f52A9xOsoqG298vbr5alW08122RiF5X/qxP1DdKHvkh4T8wCTvrqYC5+y8m\nh9oUknErbweV4b8McAGrMP/YOSWK1bsaNn/P95u6QLfMFVLmjccSsZV5eXmGtcKJ\nglgKT2hT0bvGzc7Zz3LFU+f9uTEpzAevB0yiQ2NN3AKejFqmlu65YC9ybFoxzLtw\n01gXXZFpWGUyeRuB/+0AGVpUdOSJsH135pf5idHb82nQdxYPcXuwu9+MbvR7f0C5\nGElm3yrDmQTr+VIApcxGXsJYAMPvxOVIrvTWpbuZfdqf2nwvb7q8a2iE\n-----END CERTIFICATE-----\n"
}
EOF

decho "Done! Starting install of browser."

cd $BROWSER_DIR
wget $FRONT_END_DOWNLOAD
unzip build.zip

cd $BROWSER_SERVER_DIR
cat <<EOF > $BROWSER_SERVER_DIR/some set of file
content
EOF


decho "Setting up supervisor..."
cat <<EOF > /etc/supervisor/conf.d/hyper-machine.conf
[program:hyper-server]
command=/usr/bin/node $INSTALL_DIR/bin/lamassu-machine
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/hyper-machine.err.log
stdout_logfile=/var/log/supervisor/hyper-machine.out.log
stdout_logfile_backups=2
stderr_logfile_backups=2s
EOF

cat <<EOF > /etc/supervisor/conf.d/hyper-server-browser.conf
[program:hyper-server-browser]
directory=/opt/hyper-browser/build
command=python3 -m http.server 3001
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/hyper-server-browser.err.log
stdout_logfile=/var/log/supervisor/hyper-server-browser.out.log
stdout_logfile_backups=2
stderr_logfile_backups=2
EOF

cat <<EOF > /etc/supervisor/conf.d/hyper-browser.conf
[program:hyper-browser]
command=/usr/bin/chromium --kiosk  --incognito --disable-pinch http://127.0.0.1:3001
environment=DISPLAY=":0"
user=ubilinux
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/hyper-browser.err.log
stdout_logfile=/var/log/supervisor/hyper-browser.out.log
stdout_logfile_backups=2
stderr_logfile_backups=2
EOF

decho "Remove original service"
mv /etc/supervisor/conf.d/lamassu-updater.conf /opt/backup/supervisor/conf.d/lamassu-updater.conf
mv /etc/supervisor/conf.d/lamassu-watchdog.conf /opt/backup/supervisor/conf.d/lamassu-watchdog.conf
mv /etc/supervisor/conf.d/lamassu-machine.conf /opt/backup/supervisor/conf.d/lamassu-machine.conf
mv /etc/supervisor/conf.d/lamassu-browser.conf /opt/backup/supervisor/conf.d/lamassu-browser.conf

service supervisor restart >> $LOG_FILE 2>&1

decho "Done! Machine."

