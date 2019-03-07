## deployx

Node deploy cli utils.

## cmd

```
#: npm install deployx -g

```

```
#: cd <workdir>
#: deployx init
   create deploy.json finish
```

deploy.json

```json


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
}


```

```
#: deployx -h

Usage: index [options] [command]

Options:
  -V, --version                          output the version number
  -e, --env <env>                        deploy by env[dev/test/prod]
  -c, --configJsonName <configJsonName>  deploy config json name
  -d, --debug                            show debug message
  -h, --help                             output usage information

Commands:
  init                                   create deploy.json


```

## deploy

```
#: deployx -e prod

```
or

```
   "scripts": {
        "deploy": "deployx -e prod"
    }

#: npm run deploy
```