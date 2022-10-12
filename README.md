# hyper-machine

Hyper's atm machine software

# Setup

## SASS
- Create new device (can get it from uuidv4 generator/other generator which able to generate random string and no  guessable)
- Fill in the create form, after created the device, you would get the device id + the <device private key string> 
- Those string will pack into a text like
  $ curl -sS https://raw.githubusercontent.com/weequan93/lamassu-machine/hyper-7.5.2-wip/remote_install/install_<version>.sh | bash -s -- <atm_no> <fiat_code> <ppk>
  Paste it into the command prompt after ssh into the machine.

## Machine
- You need to get the user login password from the manufacture. After having the user login password, you can connect to the device via private network ip address.
- Execute the text getting from the sass, after execution you are good to go.

- Extra Checking steps
  - Check for the `$ supervisorctl status`, should dipslay
    - hyper-janitor
    - hyper-updater
    - hyper-watchdog
    - hyper-browser
    - hyper-maintenance
  - Check with some transaction

    

# Setup

$ curl -sS https://raw.githubusercontent.com/weequan93/lamassu-machine/hyper-7.5.2-wip/remote_install/install_<version>.sh | bash -s -- <atm_no>
  - version = [tenjo, sintra]
  - atm_no = "unique identifier of a atm machine, getting from the sass configuration"
  - fiatcode = "fiatcode is the fiat currency of the machine can support, normally it is confirmmed by the note validator module of the machine and the sass configuration"

# Clear Setup








## Pull Requests

We do not generally accept outside pull requests for new features. Please consult with us before putting a lot of work into a pull request.

## Installing

To install, see [INSTALL.md](INSTALL.md).
