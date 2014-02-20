var _vm = function() {
    this.socket = null;

    this.voteCardValues = [0, 0.5, 1, 2, 3, 8, 13];

    // every user { id, name, vote } 
    this.users = ko.observableArray();
    this.users.subscribe(function(newVal) {
        console.log('users subscription, newVal=', newVal);
    });
    this.allVoted = ko.computed(function() {
        if (this.users().length == 0) {
            return false;
        }
        var ret = true;
        $.each(this.users(), function(i, user) {
            if (!user.vote()) {
                ret = false;
            }
        });
        return ret;
    }, this);
    this.allVoted.subscribe(function(newVal) {
        console.log('allVoted subscription, newVal=', newVal);
    });

    this.userName = ko.observable();
    this.userId = ko.observable();
    this.roomName = ko.observable();

    // convert .vote to observable
    this.prepareUserData = function(users) {
        function prepare(data) {
            if (!data.vote || !ko.isObservable(data.vote)) {
                data.vote = ko.observable(data.vote);
            }
        }
        if (users instanceof Array) {
            $.each(users, function(i, u) {
                prepare(u);
            });
        } else {
            prepare(users);
        }
        return users;
    }

    this.init = function() {
        // @TODO: show loader
        this.prepareSocket($.proxy(function() {
            // @TODO: hide loader 
        }, this));
    };

    this.prepareSocket = function(callback) {
        this.socket = io.connect('http://tupi.ca:7654/');
        this.socket.on('connect', function() {
            callback && callback();
        });

        this.socket.on('hello', $.proxy(function(data) {
            console.log('hello', data.id);
            this.userId(data.id);
        }, this));

        this.socket.on('server_error', $.proxy(function(data) {
            alert('Server returned error: ' + data.msg);
        }));

        this.socket.on('error', function(data) {
            console.log('socket error:', data);
        });

        this.socket.on('welcome', $.proxy(function(data) {
            console.log('welcome', data);
            this.roomName(data.roomName);
            this.users(this.prepareUserData(data.users));
        }, this));

        this.socket.on('joined', $.proxy(function(data) {
            // skip ourselves
            if (data.id == this.userId()) { 
                return;
            }

            this.users.push(this.prepareUserData(data));
        }, this));

        this.socket.on('user_voted', $.proxy(function(data) {
            // catch voted user and set 'vote' field
            this.users(
                $.map(this.users(), function(u) {
                    if (u.id == data.id) {
                        u.vote(data.vote);
                    } 
                    return u;
                })
            );
        }, this));

        this.socket.on('quit', $.proxy(function(data) {
            // remove user from list
            this.users(
                $.map(this.users(), function(u) {
                    return u.id == data.id ? undefined : u;
                })
            );
        }, this));
    }

    // dom elements listeners
    this.onLoginClick = function() {
        if (!/^[a-z0-9-_]+$/i.test(this.userName())) {
            return alert('Username must be [a-z0-9-_\.]+'); 
        }
        this.socket.emit('set_name', { name: this.userName() });
    }

    this.onEnterClick = function() {
        console.log('on enter click', this.roomName());
        this.socket.emit('join', { roomName: this.roomName() });
    }

    this.onCreateRoomClick = function() {
        this.socket.emit('join');
    }

    this.onVoteCardClick = function(vote) {
        vm.socket.emit('vote', { roomName: vm.roomName(), vote: vote });
    }

}

$(function() {
    ko.applyBindings(window.vm = new _vm());
    vm.init();
});
