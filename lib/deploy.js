const SSH2Promise = require('ssh2-promise');
const zipdir = require('zip-dir');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const fse = require('fs-extra');
const path = require('path');
const process = require('process');

const DEPLOY_JSON = `
{
    "prod": [{
        "urls": ["root:123456@111.111.111.111:22"],
        "cmds": [{
                "type": "local-cmd",
                "cmd": "npm run build"
            },
            {
                "type": "remote-cmd",
                "cmd": "mkdir -p /home/test"
            },
            {
                "type": "upload-file",
                "files": ["dist", "server.js"],
                "remote": "/home/test"
            },
            {
                "type": "remote-cmd",
                "cmd": "npm i && node server.js"
            }
        ]
    }],
    "dev": [],
    "test": []
}`;


const INSTALL_UNZIP_SHELL = `#!/usr/bin/env bash
function haveCmd() {
  if command -v $1 >/dev/null 2>&1;then
    return 1;
  else
    return 0;
  fi
}
function installUnzip () {
  haveCmd yum
  if [ $? == 1 ]
  then
    yum -y install unzip
  else
    haveCmd apt-get
    if [ $? == 1 ]
    then
      apt-get -y install unzip
    else
      echo "[deploy] #### please install unzip in server ####"
    fi
  fi
}
haveCmd unzip
if [ $? == 0 ]
then
 installUnzip
fi`


function Deploy() {
    this.ssh = null;
    this.config = null;
    this.deployName = "";
    this.showDebug = true;
    this.log = function(text) {
        if (text == undefined) {
            return;
        }
        text = text.toString().trim();
        if (text.length > 0) {
            console.log(`[${this.config.host}]:${text}`);
        }
    };
    this.localLog = function(text) {
        if (text == undefined) {
            return;
        }
        text = text.toString().trim();
        if (text.length > 0) {
            console.log(`[127.0.0.1]:${text}`);
        }

    };
    this.debug = function(text) {

        if (this.showDebug && text && text.toString().length > 0) {
            console.log(`[debug]:${text}`);
        }
    };
    this.getDeployName = function(suf) {
        let name = 'deploy_' + new Date().getTime();
        return suf ? name + suf : name;
    };

    this.copyFiles2Tmp = function(cmd) {

        let tmpPath = path.join(os.tmpdir(), this.deployName);
        try {

            fs.mkdirSync(tmpPath, 0777);
        } catch (e) {
            if (e) {
                this.debug(e);
            }
        }

        let files = [];
        cmd.files instanceof Array ? files = cmd.files : files.push(cmd.files);

        for (let f of files) {
            let spath = path.join(process.cwd(), f);
            let dpath = path.join(tmpPath, f);
            try {
                fse.copySync(spath, dpath)
            } catch (e) {
                if (e) {
                    this.debug(e);
                }
                return "";
            }
        }
        return files.length > 0 ? tmpPath : "";

    };

    this.uploadFilePromis = async function(cmd) {
        let ssh = this.ssh;
        let _this = this;
        let p = this.copyFiles2Tmp(cmd);
        if (p == "") {
            return Promise.reject('');
        }
        let zipName = this.deployName + ".zip";
        cmd.file = await this.zipPromis({
            path: p,
            name: path.join(os.tmpdir(), zipName)
        });
        if (cmd.remote.charAt(cmd.remote.length - 1) === '/') {
            cmd.remote = cmd.remote + zipName;
        } else {
            cmd.remote = cmd.remote + '/' + zipName;
        }
        return new Promise((res, rej) => {
            var sftp = ssh.sftp();
            sftp.fastPut(cmd.file,
                cmd.remote).then((data) => {
                _this.log('upload finish');
                fs.unlinkSync(cmd.file, (e) => {
                    if (e) {
                        _this.debug(e);
                    }
                });
                res(cmd.remote);
            }).catch((err) => {
                rej(err);
            });
        });
    };

    this.zipPromis = function(cmd) {

        let _this = this;
        return new Promise((res, rej) => {

            zipdir(cmd.path, {
                saveTo: cmd.name,
                filter: (path, stat) => {
                    let ret = true;
                    if (cmd.excludeRegex) {
                        for (let i = 0; i < cmd.excludeRegex; i++) {
                            if (path.test(new RegExp(cmd.excludeRegex[i]))) {
                                ret = false;
                                break;
                            }
                        }
                    }
                    return ret;
                }
            }, function(err, buffer) {

                _this.rmdir(cmd.path, () => {

                });
                if (err) {
                    rej(err);
                    return;
                }
                res(cmd.name);
            });

        });
    };

    this.exeLocalPromis = function(cmd) {

        let _this = this;
        return new Promise((res, rej) => {

            cp.exec(cmd.cmd, (err, stdout, stderr) => {
                if (err) {
                    rej(err)
                    return;
                }
                if (stdout) {
                    _this.localLog(`${stdout}`);
                }
                if (stderr) {
                    _this.localLog(`${stderr}`);
                }
                res();
            })
        });
    };

    this.exeRemotePromis = function(cmd, showLog) {
        let _this = this;
        let ssh = this.ssh;
        return new Promise((res, rej) => {
            ssh.exec(cmd.cmd).then((data) => {
                if (showLog == undefined ? true : showLog) {
                    _this.log("" + data);
                }
                res(data);
            }).catch((err) => {
                rej(err);
            });
        });
    };

    this.installUnzipRmote = function(remote) {
        let ssh = this.ssh;
        return new Promise((res, rej) => {
            ssh.exec(remote).then((data) => {
                res(data);
            }).catch((err) => {
                rej(err);
            });
        });
    };

    this.deploy = function(config, cmds) {
        this.deployName = this.getDeployName();
        this.ssh = new SSH2Promise(config);
        this.config = config;

        let ret = true;
        let _this = this;
        (async function() {
            try {

                await _this.ssh.connect();

                for (let i = 0; i < cmds.length; i++) {
                    switch (cmds[i].type) {
                        case "local-cmd":
                            {
                                await _this.exeLocalPromis(cmds[i]);
                                break;
                            }
                        case "remote-cmd":
                            {
                                await _this.exeRemotePromis(cmds[i]);
                                break;
                            }
                        case "upload-file":
                            {
                                let remote = await _this.uploadFilePromis(cmds[i]);
                                await _this.installUnzipRmote(INSTALL_UNZIP_SHELL);
                                let dir = path.dirname(remote);
                                await _this.exeRemotePromis({
                                    cmd: "unzip -o " + remote + " -d " + dir
                                }, false);
                                await _this.exeRemotePromis({
                                    cmd: "rm -f " + remote
                                }, false);
                                break;
                            }
                    }
                }

                _this.log("deploy finish success");

            } catch (e) {
                _this.debug(e);
                ret = false;
            }
            _this.ssh.close();

        })();

        return ret;

    };




    this.start = function(config, cmds, showDebug) {
        this.showDebug = showDebug ? showDebug : false;
        return this.deploy(config, cmds);

    }


}

Deploy.prototype.rmdir = function(dir, callback) {
    let _this = this;
    fs.readdir(dir, (err, files) => {
        function next(index) {
            if (index == files.length) return fs.rmdir(dir, callback)
            let newPath = path.join(dir, files[index]);
            fs.stat(newPath, (err, stat) => {
                if (stat.isDirectory()) {
                    _this.rmdir(newPath, () => next(index + 1))
                } else {
                    fs.unlink(newPath, () => next(index + 1))
                }
            })
        }
        next(0)
    })
};




function getConfig(path) {
    let content = fs.readFileSync(path);
    return JSON.parse(content);
};

function parseConfig(config, env) {

    let envConfig = config[env];
    let hostConfigs = [];

    if (envConfig == undefined) {
        console.log(`not find env: ${env}`);
        return [];
    }

    if (envConfig instanceof Array) {
        hostConfigs = envConfig;
    } else {
        hostConfigs.push(envConfig);
    }
    if (hostConfigs.length == 0) {
        console.log(`not find json struct`);
        return [];
    }
    let deployConfig = [];
    for (let i = 0; i < hostConfigs.length; i++) {
        if (hostConfigs[i].urls == undefined) {
            console.log(`not find urls`);
            return [];
        }
        if (hostConfigs[i].cmds == undefined) {
            console.log(`not find cmds`);
            return [];
        }
        if (hostConfigs[i].urls instanceof Array) {
            for (let j = 0; j < hostConfigs[i].urls.length; j++) {
                deployConfig.push({
                    url: hostConfigs[i].urls[j],
                    cmds: hostConfigs[i].cmds
                });
            }
        } else {
            deployConfig.push({
                url: hostConfigs[i].urls,
                cmds: hostConfigs[i].cmds
            });
        }
    }
    let reg = /(.*?):(.*?)@(.*?):(.*$)/;
    for (let i = 0; i < deployConfig.length; i++) {
        let murl = deployConfig[i].url.match(reg);
        if (murl.length != 5) {
            console.log('parse err: ' + deployConfig[i].url);
            return [];
        }
        deployConfig[i].config = {
            username: murl[1],
            password: murl[2],
            host: murl[3],
            port: murl[4]
        }
    }
    return deployConfig;

};

function deploy(configPath, env, showDebug) {

    if (!fs.existsSync(configPath)) {
        console.log(`${configPath} not find`);
        return;
    }

    let config = getConfig(configPath);
    let configs = parseConfig(config, env);

    for (let deployConfig of configs) {
        let deploy = new Deploy();

        if (!deploy.start(deployConfig.config, deployConfig.cmds, showDebug)) {
            break;
        }
    }
}


function init() {
    let name = 'deploy.json';
    if (fs.existsSync(name)) {
        console.log(`${name} exisits `);
        return;
    }

    fs.writeFileSync(name, DEPLOY_JSON);
    console.log(`create ${name} finish `);
}

module.exports = {
    deploy: deploy,
    init: init
};