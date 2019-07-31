/**
 * Created by Andres Carmona Gil on 05/08/2016 for Thingtrack SL.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var MongoClient = require('mongodb').MongoClient
    , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/test';
var fs = require('fs-extra');
var when = require('when');
var nodeFn = require('when/node/function');
var keys = require('when/keys');
var fspath = require("path");
var mkdirp = fs.mkdirs;
ObjectId = require('mongodb').ObjectId
//var log = require("../log");

var promiseDir = nodeFn.lift(mkdirp);

var initialFlowLoadComplete = false;
var settings;
var flowsFile;
var projectFile;
var flowsFullPath;
var flowsFileBackup;
var credentialsFile;
var credentialsFileBackup;
var oldCredentialsFile;
var sessionsFile;
var libDir;
var libFlowsDir;
var globalSettingsFile;
function getFileMeta(root,path) {
    var fn = fspath.join(root,path);
    var fd = fs.openSync(fn,"r");
    var size = fs.fstatSync(fd).size;
    var meta = {};
    var read = 0;
    var length = 10;
    var remaining = "";
    var buffer = Buffer(length);
    while(read < size) {
        read+=fs.readSync(fd,buffer,0,length);
        var data = remaining+buffer.toString();
        var parts = data.split("\n");
        remaining = parts.splice(-1);
        for (var i=0;i<parts.length;i+=1) {
            var match = /^\/\/ (\w+): (.*)/.exec(parts[i]);
            if (match) {
                meta[match[1]] = match[2];
            } else {
                read = size;
                break;
            }
        }
    }
    fs.closeSync(fd);
    return meta;
}

function getFileBody(root,path) {
    var body = "";
    var fn = fspath.join(root,path);
    var fd = fs.openSync(fn,"r");
    var size = fs.fstatSync(fd).size;
    var scanning = true;
    var read = 0;
    var length = 50;
    var remaining = "";
    var buffer = Buffer(length);
    while(read < size) {
        var thisRead = fs.readSync(fd,buffer,0,length);
        read += thisRead;
        if (scanning) {
            var data = remaining+buffer.slice(0,thisRead).toString();
            var parts = data.split("\n");
            remaining = parts.splice(-1)[0];
            for (var i=0;i<parts.length;i+=1) {
                if (! /^\/\/ \w+: /.test(parts[i])) {
                    scanning = false;
                    body += parts[i]+"\n";
                }
            }
            if (! /^\/\/ \w+: /.test(remaining)) {
                scanning = false;
            }
            if (!scanning) {
                body += remaining;
            }
        } else {
            body += buffer.slice(0,thisRead).toString();
        }
    }
    fs.closeSync(fd);
    return body;
}

/**
 * Write content to a file using UTF8 encoding.
 * This forces a fsync before completing to ensure
 * the write hits disk.
 */
function writeFile(path,content) {
    return when.promise(function(resolve,reject) {
        var stream = fs.createWriteStream(path);
        stream.on('open',function(fd) {
            stream.end(content,'utf8',function() {
                fs.fsync(fd,resolve);
            });
        });
        stream.on('error',function(err) {
            reject(err);
        });
    });
}
var storage={
    init: function(_settings) {
        var promises = [];
        settings = _settings;
        if (settings.mongodbMultiproject){
            url = 'mongodb://'
            if(settings.mongodbMultiproject.user){
                url+=settings.mongodbMultiproject.user
                url+=":"
                url+=settings.mongodbMultiproject.password
                url+="@"
            }
            url+=settings.mongodbMultiproject.host || "localhost"
            url+=":"
            url+=settings.mongodbMultiproject.port || "27017"
            url+="/"
            url+=settings.mongodbMultiproject.db || "test"
        }
        if (settings.mongodbMultiproject.url){
            url = settings.mongodbMultiproject.url
        }
        if (!settings.userDir) {
            try {
                fs.statSync(fspath.join(process.env.NODE_RED_HOME,".config.json"));
                settings.userDir = process.env.NODE_RED_HOME;
            } catch(err) {
                settings.userDir = fspath.join(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE || process.env.NODE_RED_HOME,".node-red");
                if (!settings.readOnly) {
                    promises.push(promiseDir(fspath.join(settings.userDir,"node_modules")));
                }
            }
        }

        if (settings.flowFile) {
            flowsFile = settings.flowFile;
            // handle Unix and Windows "C:\"
            if ((flowsFile[0] == "/") || (flowsFile[1] == ":")) {
                // Absolute path
                flowsFullPath = flowsFile;
            } else if (flowsFile.substring(0,2) === "./") {
                // Relative to cwd
                flowsFullPath = fspath.join(process.cwd(),flowsFile);
            } else {
                try {
                    fs.statSync(fspath.join(process.cwd(),flowsFile));
                    // Found in cwd
                    flowsFullPath = fspath.join(process.cwd(),flowsFile);
                } catch(err) {
                    // Use userDir
                    flowsFullPath = fspath.join(settings.userDir,flowsFile);
                }
            }

        } else {
            flowsFile = 'flows_'+require('os').hostname()+'.json';
            flowsFullPath = fspath.join(settings.userDir,flowsFile);
        }
        var ffExt = fspath.extname(flowsFullPath);
        var ffName = fspath.basename(flowsFullPath);
        var ffBase = fspath.basename(flowsFullPath,ffExt);
        var ffDir = fspath.dirname(flowsFullPath);

        credentialsFile = fspath.join(settings.userDir,ffBase+"_cred"+ffExt);
        credentialsFileBackup = fspath.join(settings.userDir,"."+ffBase+"_cred"+ffExt+".backup");

        oldCredentialsFile = fspath.join(settings.userDir,"credentials.json");

        //flowsFileBackup = fspath.join(ffDir,"."+ffName+".backup");

        sessionsFile = fspath.join(settings.userDir,".sessions.json");
        //projectFile = fspath.join(settings.userDir,"projects.json");

        libDir = fspath.join(settings.userDir,"lib");
        libFlowsDir = fspath.join(libDir,"flows");

        globalSettingsFile = fspath.join(settings.userDir,".config.json");

        if (!settings.readOnly) {
            promises.push(promiseDir(libFlowsDir));
        }

        return when.all(promises);
    },

    getFlows: function() {
        return when.promise(function(resolve,reject) {
            if (!initialFlowLoadComplete) {
                initialFlowLoadComplete = true;
                //log.info(log._("storage.localfilesystem.user-dir",{path:settings.userDir}));
                //log.info(log._("storage.localfilesystem.flows-file",{path:flowsFullPath}));
            }

            MongoClient.connect(url, function(err, db) {
                assert.equal(null, err);
                console.log("Connected correctly to server");

                findFlows(db, function(err,flows) {
                    if(err)
                        return reject(err)
                    db.close();
                    return resolve(flows)
                });
            });
        });
    },

    saveFlows: function(newflows) {
        return when.promise(function(resolve,reject){
            MongoClient.connect(url,function(err,db){
                var dbflows=db.collection("Flows")
                findFlows(db,function(oldflows){
                    //delete
                    if(oldflows)
                        oldflows.forEach(function(e,i,a){
                            var exist=newflows.filter(function(el){
                                return e.id===el.id
                            })
                            if(exist.length===0){
                                console.log("")
                                dbflows.deleteOne({"_id":e._id},function(err,count){
                                    if(err)
                                        return reject(err)
                                })
                            }

                        })
                    //insert or update
                    newflows.forEach(function(e,i,a){
                        //e._id=ObjectId(e._id)
                        dbflows.updateOne({id: e.id}, e, {upsert:true, w: 1}, function(err, result) {
                            if(err)
                                return reject(err)
                        })
                    })
                    return resolve()
                    db.close()
                })

            })
        })
    },


    getCredentials: function() {
        return when.promise(function(resolve) {
            MongoClient.connect(url, function(err, db) {
                var dbCredentials=db.collection('Credentials')

                dbCredentials.find({}).toArray(function(err,credentials){
                    if(err){
                        reject(err)
                    }else{
                        if(credentials.length!=0){
                            resolve(credentials.reduce(function(obj,act,i){
                                obj[act.node_id]=act.credentials
                                return obj
                            },{}))
                        }else{
                            resolve({})
                        }
                    }
                })
            });

        });
    },

    saveCredentials: function(credentials) {
        if (settings.readOnly) {
            return when.resolve();
        }
        return when.promise(function(resolve,reject) {
            MongoClient.connect(url, function (err, db) {
                var dbCredentials = db.collection('Credentials')
                for (var key in credentials) {
                    var obj_cred = {
                        node_id: key,
                        credentials: credentials[key]
                    }
                    dbCredentials.updateOne({node_id: key}, obj_cred, {
                        upsert: true,
                        w: 1
                    }, function (err, result) {
                        if (err)
                            return reject(err)
                    })
                }
                return resolve()
            });
        })

    },

    getSettings: function() {

        return when.promise(function(resolve,reject){
            MongoClient.connect(url, function(err, db) {
                assert.equal(null, err);
                console.log("Connected correctly to server");
                var settings=db.collection('setting')
                settings.find({}).toArray(function(err, setting) {
                    if(err)
                        reject(err)
                    if(setting.length===0){
                        return resolve({})
                    }else{
                        return resolve(setting[0])
                    }

                });
            });
        })
    },
    saveSettings: function(settings) {
        return when.promise(function(resolve,reject){
            MongoClient.connect(url, function(err, db) {
                assert.equal(null, err);
                console.log("Connected correctly to server");
                var dbsettings=db.collection('setting')
                dbsettings.find({}).toArray(function(err, setting) {
                    if(setting.length===0){
                        dbsettings.insertOne(settings,function(err,result){
                            if(err)
                                reject(err)
                            resolve(result)
                            db.close()
                        })
                    }else{
                        dbsettings.updateOne({id:setting[0]._id},settings,function(err,result){
                            if(err)
                                reject(err)
                            db.close()
                            resolve(result)
                        })
                    }

                });
            });
        })

    },

    getSessions: function() {
        return when.promise(function(resolve,reject) {
            MongoClient.connect(url, function(err, db) {
                var dbSessions=db.collection('Sessions')

                dbSessions.find({}).toArray(function(err,sessions){
                    if(err){
                        reject(err)
                    }else{
                        if(sessions.length!=0){
                            resolve(sessions.reduce(function(obj,act,i){
                                obj[act.accessToken]=act
                                return obj
                            },{}))
                        }else{
                            resolve({})
                        }
                    }
                })
            });
            /*
             fs.readFile(sessionsFile,'utf8',function(err,data){
             if (!err) {
             try {
             return resolve(JSON.parse(data));
             } catch(err2) {
             //log.trace("Corrupted sessions file - resetting");
             }
             }
             resolve({});
             })
             */
        });
    },
    saveSessions: function(sessions) {
        if (settings.readOnly) {
            return when.resolve();
        }
        return when.promise(function(resolve,reject){
            MongoClient.connect(url, function(err, db) {
                var dbSessions=db.collection('Sessions')
                for(var obj_session in sessions){
                    dbSessions.updateOne({user: sessions[obj_session].user}, sessions[obj_session], {upsert:true, w: 1}, function(err, result) {
                        if(err)
                            return reject(err)
                    })
                }
                return resolve()
            });
        })

        //return writeFile(sessionsFile,JSON.stringify(sessions));
    },

    getLibraryEntry: function(type,path) {
        var root = fspath.join(libDir,type);
        var rootPath = fspath.join(libDir,type,path);
        return promiseDir(root).then(function () {
            return nodeFn.call(fs.lstat, rootPath).then(function(stats) {
                if (stats.isFile()) {
                    return getFileBody(root,path);
                }
                if (path.substr(-1) == '/') {
                    path = path.substr(0,path.length-1);
                }
                return nodeFn.call(fs.readdir, rootPath).then(function(fns) {
                    var dirs = [];
                    var files = [];
                    fns.sort().filter(function(fn) {
                        var fullPath = fspath.join(path,fn);
                        var absoluteFullPath = fspath.join(root,fullPath);
                        if (fn[0] != ".") {
                            var stats = fs.lstatSync(absoluteFullPath);
                            if (stats.isDirectory()) {
                                dirs.push(fn);
                            } else {
                                var meta = getFileMeta(root,fullPath);
                                meta.fn = fn;
                                files.push(meta);
                            }
                        }
                    });
                    return dirs.concat(files);
                });
            }).otherwise(function(err) {
                if (type === "flows" && !/\.json$/.test(path)) {
                    return localfilesystem.getLibraryEntry(type,path+".json")
                        .otherwise(function(e) {
                            throw err;
                        });
                } else {
                    throw err;
                }
            });
        });
    },

    saveLibraryEntry: function(type,path,meta,body) {
        if (settings.readOnly) {
            return when.resolve();
        }
        var fn = fspath.join(libDir, type, path);
        var headers = "";
        for (var i in meta) {
            if (meta.hasOwnProperty(i)) {
                headers += "// "+i+": "+meta[i]+"\n";
            }
        }
        if (type === "flows" && settings.flowFilePretty) {
            body = JSON.stringify(JSON.parse(body),null,4);
        }
        return promiseDir(fspath.dirname(fn)).then(function () {
            writeFile(fn,headers+body);
        });
    }
}

var findFlows = function(db, callback) {
    // Get the documents collection
    var dbflows = db.collection('Flows');
    var projects = db.collection('Project');
    if(settings.mongodbMultiproject.collectionProject)
        projects=db.collection(settings.mongodbMultiproject.collectionProject);
    // Find some documents
    dbflows.find({}).toArray(function(err, flows) {
        if(err){
            console.log(err)
            callback(err)
        }
        projects.find({}).toArray(function(err, projects) {
            if(err){
                callback(err)
            }else{
                projects.forEach(function(e,i,a){
                    var exist=flows.filter(function(el){
                        return el.id==e._id.toJSON()
                    })
                    if(exist.length===0)
                        flows.push({
                            id:e._id.toJSON(),
                            name:e.description,
                            label:e.description,
                            type:"project",
                            flows:[]
                        })
                })
                callback(null,flows);
            }

        });
    });
}

module.exports=storage
