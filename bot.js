var HTTPS = require('https');
var cool = require('cool-ascii-faces');
var async = require('async');
var request = require('request');

//var kassy_gm_id = 37065014

var botID = process.env.BOT_ID;
var groupID = XXXX;
var token = process.env.GM_TOKEN;
var token_str = "?token=" + token;
var my_uid = XXXXX;
var justin_uid = XXXXX;
var my_gm_id = process.env.A_GM_ID;
var base_url = "https://api.groupme.com/v3";


/*
 cache for group info
 each group name has 2 keys, fb and gm, they are the fb thread id and the groupme groupid respectively
 */
var group_cache = {
};

//generates a random GUID for sending messages
//taken from https://www.npmjs.com/package/groupme
function generateGUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (a) {
        var b, c;
        return b = Math.random() * 16 | 0, c = a === "x" ? b : b & 3 | 8, c.toString(16);
    });
}


//generic error callback
var err_callback = function (err) {
    console.log('error posting message ' + JSON.stringify(err));
};

//generic timeout callback
var timeout_callback = function (err) {
    console.log('timeout posting message ' + JSON.stringify(err));
};

//variable that holds the facebook API object
var api;

//set the global api variable here to the parameter passed in
function setapi(api_param) {
    api = api_param;
}

//save the given groupme conversation name/ID
function save_gm_id(name, id) {
    if (!group_cache[name]) { //cache if needed
        group_cache[name] = {};
    }
    group_cache[name].gm = id;
}

//associates the facebook thread id with the name in the cache
function save_fb_thread_id(name, thread_id) {
    if (!group_cache[name]) {
        group_cache[name] = {};
    }
    group_cache[name].fb = thread_id;
}

//calls the callback with 1 param, the name if found, null if not
function get_fb_name_cache(thread_id, callback) {
    for (var name in group_cache) {
        if (group_cache.hasOwnProperty(name) && group_cache[name].fb == thread_id) {
            callback(null, name);
            return;
        }
    }
    callback("couldn't find name in cache", null);
}


//gets the groupme id for the given name
function get_gm_id(group_name, callback) {
    if (!group_cache[group_name]) {
        group_cache[group_name] = {}
    }
    if (!group_cache[group_name].gm) {

        console.log("could not find gm id for group " + group_name);

        request.get({
            url: base_url + "/groups" + token_str + "&per_page=15", //check most recent 15 groups
            json: true
        }, function (err, resp, body) {
            if (err) {
                console.log("error on finding gm id" + err);
            } else if (resp.statusCode != 200) {
                console.log("bad status code " + resp.statusCode);
                console.log(body);
            }
            else {
                //body should be an array of the groups
                for (var i in body.response) {
                    var group = body.response[i];
                    //check to see if this group is the group we're searching for
                    if (group.hasOwnProperty("name") && group.hasOwnProperty("id")) {
                        if (group.name == group_name) {
                            group_cache[group_name].gm = group.id;
                            return callback(null, group.id);
                        }
                    }
                    else {
                        console.log("group without name or id " + group);
                    }
                }
                //reached the end without returning, couldnt find group
                return callback("couldn't find group with given name");
            }
        });

    }
    else {
        console.log("returning gm id for group " + group_name);
        callback(null, group_cache[group_name].gm);
    }
}



//listens for incoming facebook messages
function listen() {
    //cache for most recent convo, for common case where only 1 groupchat going at a time, save time on searches
    var most_recent = {
        tid: null,
        name: null
    };
    api.listen(function callback(err, msg) {
        console.log("received fb message" + msg.body);
        if (err) return console.log(err);
        if (msg.threadID == most_recent.tid) {
            process_fb_msg(msg, most_recent.name);
        }
        else if (msg.threadID == my_uid) {
            //direct message between me and Kassy, only used for debugging
            if (msg.body) {
                postMessage(msg.body);
            }
            else if (msg.attachments) {
                var attachs = msg.attachments;
                if (attachs.length == 1 && attachs[0].type == 'sticker' && attachs[0].stickerID == '369239263222822') {
                    //hardcoded to look for thumbs up
                    console.log("Liking message");
                    like_last_gm_msg(groupID);
                }
            }
        }
        else {
            find_fb_by_id(msg.threadID, function (err, name) {
                if (err) return console.log(err);
                most_recent.name = name;
                most_recent.tid = msg.threadID;
                process_fb_msg(msg, name);
            });
        }

        //console.log("sent groupme message" + msg.body);
    });
}

/*
    processes the fb message sent to the group called group_name
    defines what actions are taken when a message is received
 */
function process_fb_msg(msg, group_name) {
    console.log("processing message");
    if (msg.body) {
        send_gm_msg(msg.body, group_name);
    }
    else if (msg.attachments) {
        var attachs = msg.attachments;
        if (attachs.length == 1 && attachs[0].type == 'sticker' && attachs[0].stickerID == '369239263222822') {
            //hardcoded to look for thumbs up to like message
            console.log("Liking message");
            get_gm_id(group_name, function (err, id) {
                if (err) return console.log(err);
                like_last_gm_msg(id);
            });
        }
    }
}

//likes the most recent groupme message
function like_last_gm_msg(group_id) {
    request_groupme_msgs(group_id, function (resp) {
        if (resp.messages) {
            like_groupme_msg(resp.messages[0].id, group_id);
        }
        else {
            console.log("couldn't find message list in response");
        }
    });
}

//called when a groupme message is received in the group with the given name
function receive_gm_msg(group_name) {
    var request = JSON.parse(this.req.chunks[0]);
    save_gm_id(group_name, request.group_id);
    console.log("received message with groupname " + group_name);
    /*
     below process:
     find the facebook threadID from the groupname
     forward the message to the found threadID
     */
    if (request.text && request.user_id != my_gm_id) {
        //the message text exists and it wasnt sent by me
        async.waterfall([
            function (cb) {
                //group name needs to be passed to find_fb_by_name, so this dummy function just calls it's callback
                //passing the result group_name
                cb(null, group_name);
            },
            find_fb_by_name,
            function (thread_id, cb) {
                //same idea as first function, this gets the text and sender name to send to forward_message
                cb(null, request.text, request.name, thread_id);
            },
            forward_message
        ]);
    }
    else {
        console.log("didnt forward because of no text or was my message");
    }
}

//finds a facebook group name from the threadID
//assumes api exists
function find_fb_by_id(threadID, callback) {

    async.waterfall([
        function (cb) {
            get_fb_name_cache(threadID, function (err, name) {
                //ignore error for now
                return cb(null, name);
            });
        },
        function (name, cb) {
            if (name) {
                return cb(null, name);
            }
            //didn't find it in cache, need to get from internet
            console.log("fetching facebook thread ID from web " + threadID);
            api.getThreadInfo(threadID, function (err, info) {
                if (err) return callback(err);
                else {
                    var name = info.name;
                    save_fb_thread_id(name, threadID);
                    cb(null, name);
                }
            });
        }
    ], callback); //callback to the parameter callback with either result or error
}

/*
 finds a facebook group with a given name
 if non exists, creates one
 uses caching to speed up results
 callback should take 2 params, err and the threadID of the groupchat
 */
function find_fb_by_name(name, callback) {
    if (group_cache[name].fb) { //first check the cache
        return callback(null, group_cache[name].fb);
    }

    else {
        if (!api) { //api isn't defined, can't do anything
            return callback("api undefined");
        }
        else {
            api.searchForThread(name, function (err, obj) {
                if (err) {
                    if (err.error.startsWith("Could not find thread")) {
                        //this thread doesn't exist, so create it
                        create_fb_group(name, function (err, obj) {
                            if (err) return callback(err);
                            else {
                                save_fb_thread_id(name, obj.threadID);
                                return callback(null, obj.threadID);
                            }
                        });
                    }
                    else {
                        return callback(err)
                    }
                }
                else {
                    console.log("Found fb group called " + name);
                    //console.log(obj);
                    save_fb_thread_id(name, obj.threadID); //assume that the first convo is the right one
                    return callback(null, obj[0].threadID);
                }
            })
        }
    }
}

//creates a facebook group with the given name
//expects api to exist
function create_fb_group(name, callback) {
    //to create multiple messages bw me and kassy, need group, so use justin uid as 3rd member of group
    api.sendMessage("New groupme: " + name, [api.getCurrentUserID(), my_uid, justin_uid], function (err, msginfo) {
        if (err) return callback(err);

        else {
            api.removeUserFromGroup(justin_uid, msginfo.threadID); //remove justin because he's not a part of this
            console.log("created new fb group " + name);
            save_fb_thread_id(name, msginfo.threadID);
            api.setTitle(name, msginfo.threadID, callback)

        }
    });
}

//sends a groupme message to the group with the given name
function send_gm_msg(msg, group_name) {
    var body, gid;
    //get groupme id from group name
    get_gm_id(group_name, function (err, id) {
        if (err) return console.log(err);

        gid = id;
        //build a body
        body = {
            message: {
                source_guid: generateGUID(),
                text: msg,
                attachments: []
            }
        };


        var r_opts = {
            uri: base_url + "/groups/" + gid + "/messages" + token_str,
            method: 'POST',
            headers: {'Content-Type': 'application/json'}

        };
        r_opts.body = JSON.stringify(body);

        console.log("sending " + msg + " to " + group_name);

        request(
            r_opts,
            function (err, res, body) {
                if (!err && res.statusCode == 201) {
                    //console.log(JSON.parse(body).response);
                    console.log("Successfully sent message");
                } else {
                    console.log("error in sending message");
                    console.log(err);
                    console.log(res);
                    console.log(body);
                }
            });
    });

}


//posts a message to bot1
function postMessage(message) {
    var options, body, botReq;


    options = {
        hostname: 'api.groupme.com',
        path: '/v3/bots/post',
        method: 'POST'
    };

    body = {
        "bot_id": botID,
        "text": message
    };

    console.log('sending ' + message + ' to ' + botID);

    botReq = HTTPS.request(options, function (res) {
        if (res.statusCode == 202) {
            //neat
        } else {
            console.log('rejecting bad status code ' + res.statusCode);
        }
    });

    botReq.on('error', err_callback);
    botReq.on('timeout', timeout_callback);
    botReq.end(JSON.stringify(body));
}

//likes the groupme message with the given id
function like_groupme_msg(message_id, group_id) {
    console.log("going to like groupme message");

    request.post(base_url + "/messages/" + group_id + "/" + message_id + "/like" + token_str, function (err, resp, body) {
        if (err) {
            console.log("error liking message")
            console.log(err);
        }
        else {
            if (resp.statusCode != 200) {
                console.log("bad status code on liking message");
                console.log(body);
            }
            else {
                console.log("liked message");
            }
        }
    });
}


//callback should expect just the groupme response
function request_groupme_msgs(group_id, callback) {
    console.log("requesting groupme messages");

    request.get({
        url: base_url + "/groups/" + group_id + "/messages" + token_str,
        json: true
    }, function (err, resp, body) {
        if (err) {
            console.log("Error on msg req " + err);
        }
        else if (resp.statusCode == 200) {
            console.log("Received good response to message request");
            callback(body.response);
        }
        else {
            console.log("bad status code on request");
            console.log(body);
        }
    });
}

//forwards a message with text 'text' to facebook
function forward_message(text, sender, recepient) {
    console.log("forwarding message");
    if (api) {
        var message = sender + ": " + text;
        api.sendMessage(message, recepient, function (err, msgInfo) {
            if (err) return console.log(err);

        });
        console.log("sent facebook message: " + message);
    }
    else {
        console.log("api not found in forward message");
    }
}

//exports.respond = respond;
exports.setapi = setapi;
exports.listen = listen;
exports.receive = receive_gm_msg;
