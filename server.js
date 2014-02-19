var socketio = require('socket.io'),
    static = require('node-static'),
    http = require('http'),
    _ = require('lodash');

var file = new static.Server('./pub'),
    server = http.createServer(function(req, res) {
        req.addListener('end', function() {
            file.serve(req, res);
        }).resume();
    }).listen(7654);

var io = socketio.listen(server);

/////////////////////////////////////
var socketDataFieldName = '_data';

function sendError(socket, msg) {
    socket.emit('error', {
        msg: msg 
    });
}

function setData(socket, data) {
    if (!socket[socketDataFieldName]) {
        socket[socketDataFieldName] = {};
    }
    for (var key in data) {
        socket[socketDataFieldName][key] = data[key];
    }
}

function getData(socket, fields) {
    var ret = {};
    if (typeof socket[socketDataFieldName] === 'undefined') {
        return undefined;
    }
    if (! (fields instanceof Array)) {
        fields = [fields];
    }
    fields.forEach(function(fieldName) {
        ret[fieldName] = socket[socketDataFieldName][fieldName];
    });
    return ret;
}

function isUsernameValid(username) {
    return /^[a-z0-9_\.-]+$/i.test(username);
}

function generateRoomName() {
    return Math.floor(Math.random() * 9000 + 1000).toString(36);
}

function isAuthorized(socket) {
    return socket[socketDataFieldName] ? !!socket[socketDataFieldName].name : false; 
}

function roomExists(roomName) {
    console.log('Rooms=', io.sockets.manager.rooms);
    if (roomName == '') { 
        return false; // no access to empty room
    }
    return ('/' + roomName) in io.sockets.manager.rooms;
}

function isVoteValid(vote) {
    return [0, 0.5, 1, 2, 3, 8, 13].indexOf(vote) != -1;
}

function userIsIn(socket, roomName) {
    return io.sockets.clients(roomName).indexOf(socket) != -1;
}

io.sockets.on('connection', function(socket) {
    console.log('connected', socket.id);
    socket.on('set_name', function(data) {
        if (isAuthorized(socket)) {
            return sendError(socket, 'Already authorized');
        }
        if (!data) { return; }
        if (!data.name || !isUsernameValid(data.name)) {
            return sendError(socket, 'Username is empty or invalid');
        }
        setData(socket, { name: data.name, id: socket.id });
        socket.emit('hello', { id: socket.id });
    });

    ////////////////////////////////////////////////////////////
    socket.on('join', function(data) {
        console.log('JOIN', data);
        if (!isAuthorized(socket)) {
            return sendError(socket, 'Not authorized');
        }

        var roomName;
        if ( data && (roomName = data.roomName) ) {
            if (!roomExists(roomName)) {
                return sendError(socket, 'Room with such name does not exist');
            }
        } else {
            roomName = generateRoomName();
        }

        setData(socket, { vote: undefined });
        // @TODO: check if this user is already inside

        socket.join(roomName);
        socket.emit('welcome', {
            roomName: roomName,
            users: _.map(io.sockets.clients(roomName), function(s) {
                return getData(s, ['id', 'name', 'vote' ])
            })
        });
        io.sockets.in(roomName).emit('joined', getData(socket, ['id', 'name', 'vote']));
    });

    ////////////////////////////////////////////////////////////
    socket.on('vote', function(data) {
        // @TODO: check authorized
        // @TODO: check room
        if (!data) { return; }
        var roomName = data.roomName,
            vote = data.vote;

        if (!userIsIn(socket, roomName)) {
            return sendError(socket, 'You are not in this room');
        }
        if (!isVoteValid(vote)) {
            return sendError(socket, 'Your vote is invalid');
        }
        setData(socket, {vote:vote});

        var data2send = getData(socket, ['id']);
        data2send.vote = vote;
        io.sockets.in(roomName).emit('user_voted', data2send); 
    });
    
    ////////////////////////////////////////////////////////////
    socket.on('disconnect', function() {
        // @TODO: check authorized
        // find all rooms where client was
        _.filter(Object.keys(io.sockets.manager.roomClients[socket.id]), function(val) {
            return val != '';
        }).forEach(function(roomName) {
            // every room begins with /
            io.sockets.in(roomName.substr(1)).emit('quit', getData(socket, ['id']));
        });


        socket.emit('disconnect', getData(socket, 'id'));
    });
});
