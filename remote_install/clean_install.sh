
set +e

export LOG_FILE=/tmp/install.log

INSTALL_DIR=/opt/hyper-machine
GIT_REPOSITORY=https://github.com/weequan93/lamassu-machine.git
GIT_BRANCH=hyper-7.5.2-wip

DATA_DIR=/opt/hyper-machine/data
DATA_DIR_HYPER_DB=/opt/hyper-machine/data/tx-hyperdb
FRONT_END_DOWNLOAD=https://atm-frontend.s3.ap-south-1.amazonaws.com/default/build.zip
BROWSER_DIR=/opt/hyper-browser
MAINTENANCE_DIR=/opt/hyper-maintenance




# remove supervisor
rm /etc/supervisor/conf.d/hyper-machine.conf
rm /etc/supervisor/conf.d/hyper-maintenance.conf
rm /etc/supervisor/conf.d/hyper-server-browser.conf
rm /etc/supervisor/conf.d/hyper-browser.conf
rm /etc/supervisor/conf.d/hyper-watchdog.conf
rm /etc/supervisor/conf.d/hyper-updater.conf
rm /etc/supervisor/conf.d/hyper-janitor.conf

# service supervisor restart >> $LOG_FILE 2>&1

# rm folder
rm -rf $INSTALL_DIR
rm -rf $BROWSER_DIR
rm -rf $MAINTENANCE_DIR
rm -rf $DATA_DIR_HYPER_DB
rm -rf $DATA_DIR




