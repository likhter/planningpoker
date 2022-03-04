import { Server } from 'socket.io';
import { Server as StaticServer } from 'node-static';
import { createServer } from 'http';

const PORT = process.env.PORT || 3000;

const file = new StaticServer('./pub'),
    server = createServer(function(req, res) {
        req.addListener('end', function() {
            file.serve(req, res);
        }).resume();
    }).listen(PORT, () => { console.log(`Listening on ${PORT}`)});

const io = new Server(server);

const socketDataFieldName = '_data';

// @TODO pull utilities into separate file
function sendError(socket, msg) {
    socket.emit('server_error', {
        msg: msg 
    });
}

function setData(socket, data) {
    if (!socket[socketDataFieldName]) {
        socket[socketDataFieldName] = {};
    }
    for (const key in data) {
        socket[socketDataFieldName][key] = data[key];
    }
}

function getData(socket, fields) {
    const ret = {};
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
    console.log('Available Rooms (incl private lobbies) =', io.sockets.adapter.rooms.keys());
    if (roomName == '') { 
        return false; // no access to empty room
    }
    return !!io.sockets.adapter.rooms.get(roomName);
}

function isVoteValid(vote) {
    return [0, 0.5, 1, 1.5, 2, 3, 5, 5, 5, 5, 5, 8, 13].indexOf(vote) != -1;
}

function isUserIn(socket, roomName) {
    return Array.from(io.sockets.adapter.rooms.get(roomName).keys()).indexOf(socket.id) != -1;
}

io.sockets.on('connection', function(socket) {
    console.log(socket.id, ': CONNECT new socket');
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

    socket.on('join', async function(data) {
        console.log(socket.id, ': JOIN', data || 'new room');
        if (!isAuthorized(socket)) {
            return sendError(socket, 'Not authorized');
        }

        let roomName;
        if ( data && (roomName = data.roomName) ) {
            if (!roomExists(roomName)) {
                console.log(socket.id, ': JOIN failed, room', roomName, 'does not exist');
                return sendError(socket, 'Room with such name does not exist');
            }
        } else {
            roomName = generateRoomName();
        }

        setData(socket, { vote: undefined });
        // @TODO: check if this user is already inside

        await socket.join(roomName);

        socket.emit('welcome', {
            roomName: roomName,
            users: Array.from(io.sockets.adapter.rooms.get(roomName).keys()).map(function(s) {
                // use the key to get the data from a specific socket (user)
                return getData(io.sockets.sockets.get(s), ['id', 'name', 'vote' ]);
            })
        });
        io.sockets.in(roomName).emit('joined', getData(socket, ['id', 'name', 'vote']));
    });

    socket.on('vote', function(data) {
        if (!isAuthorized(socket)) {
            return sendError(socket, 'Not authorized');
        }

        if (!data) { return; }

        const roomName = data.roomName,
            vote = data.vote;

        if (!isUserIn(socket, roomName)) {
            return sendError(socket, 'You are not in this room');
        }

        if (!isVoteValid(vote)) {
            return sendError(socket, 'Your vote is invalid');
        }
        setData(socket, {vote:vote});

        const voteData = getData(socket, ['id']);
        voteData.vote = vote;
        io.sockets.in(roomName).emit('user_voted', voteData); 
    });
    
    socket.on('reset', function(data) {
        if (!isAuthorized(socket)) {
            return sendError(socket, 'Not authorized');
        }

        if (!data) { return; }
        const roomName = data.roomName;
        if (!isUserIn(socket, roomName)) {
            return sendError(socket, `You are not in room '${roomName}'`);
        }
        setData(socket, { vote: undefined });
        io.sockets.in(roomName).emit('reset', getData(socket, ['id']));
    });

    socket.on('disconnecting', function() {
        if (!isAuthorized(socket)) {
            return; // no reason to send error message here;
        }

        io.sockets.adapter.rooms.forEach(function(value, key) {
            // find all rooms where client was ... 
            if (io.sockets.adapter.rooms.get(key).has(socket.id)) {
                // ...& quit the room (emit to client to clean up the UI)
                console.log(socket.id, ': DISCONNECT leaving from room', key);
                io.sockets.in(key).emit('quit', getData(socket, ['id']));    
            }
        })
    });
});
