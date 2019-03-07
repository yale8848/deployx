#! /usr/bin/env node

const deploy = require('./lib/deploy.js');
const pkg = require('./package.json');
const program = require('commander');

let type = "";
program.allowUnknownOption()
    .version(pkg.version)
    .option('-e, --env <env>', 'deploy by env[dev/test/prod]')
    .option('-c, --configJsonName <configJsonName>', 'deploy config json name')
    .option('-d, --debug', 'show debug message');

program.command('init').description('create deploy.json').action(() => {
    type = 'init';
});
program.parse(process.argv);

if (type == 'init') {
    deploy.init();
    return;
}

let env = 'dev';
let configJsonName = 'deploy.json';
let showDebug = false;

if (program.env) {
    env = program.env;
} else {
    console.log('default env : ' + env);
}
if (program.configJsonName) {
    configJsonName = program.configJsonName;
} else {
    console.log('default configJsonName : ' + configJsonName);
}
if (program.debug) {
    showDebug = program.debug;
} else {
    console.log('default show debug message  :  ' + showDebug);
}

deploy.deploy(configJsonName, env, showDebug);