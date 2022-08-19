#!/usr/bin/env bash
set -e

export LOG_FILE=/tmp/install.log

INSTALL_DIR=/opt/hyper-machine-2
GIT_REPOSITORY=https://github.com/weequan93/lamassu-machine.git
GIT_BRANCH=hyper-7.5.2-wip

DATA_DIR=/opt/hyper-machine-2/data
DATA_DIR_HYPER_DB=/opt/hyper-machine-2/data/tx-hyperdb
FRONT_END_DOWNLOAD=https://atm-frontend.s3.ap-south-1.amazonaws.com/default/build.zip
BROWSER_DIR=/opt/hyper-browser
BROWSER_SERVER_DIR=/opt/hyper-browser-server

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
  "postgresql": "postgres://lamassu_pg:$POSTGRES_PW@localhost/lamassu",
}
EOF

cat <<EOF > $DATA_DIR/connection-info.json
{
  "postgresql": "postgres://lamassu_pg:$POSTGRES_PW@localhost/lamassu",
}
EOF

cat <<EOF > $DATA_DIR/machine-info.json
{
  "postgresql": "postgres://lamassu_pg:$POSTGRES_PW@localhost/lamassu",
}
EOF


service supervisor restart >> $LOG_FILE 2>&1

decho "Done! Machine."

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
command=${NPM_BIN}/lamassu-server
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/lamassu-server.err.log
stdout_logfile=/var/log/supervisor/lamassu-server.out.log
environment=HOME="/root"
EOF

cat <<EOF > /etc/supervisor/conf.d/hyper-browser-server.conf
[program:lamassu-admin-server]
command=${NPM_BIN}/lamassu-admin-server
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/lamassu-admin-server.err.log
stdout_logfile=/var/log/supervisor/lamassu-admin-server.out.log
environment=HOME="/root"
EOF

cat <<EOF > /etc/supervisor/conf.d/hyper-browser.conf
[program:lamassu-admin-server]
command=${NPM_BIN}/lamassu-admin-server
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/lamassu-admin-server.err.log
stdout_logfile=/var/log/supervisor/lamassu-admin-server.out.log
environment=HOME="/root"
EOF


decho "Remove original service"

