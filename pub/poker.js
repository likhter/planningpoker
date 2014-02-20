var _vm = function() {
    this.socket = null;

    this.voteCardValues = [0, 0.5, 1, 2, 3, 5, 8, 13];

    // every user { id, name, vote() } 
    this.users = ko.observableArray();
    this.allVoted = ko.computed(function() {
        if (this.users().length == 0) {
            return false;
        }
        var ret = true;
        $.each(this.users(), function(i, user) {
            if (user.vote() === undefined) {
                ret = false;
            }
        });
        return ret;
    }, this);

    this.userName = ko.observable();
    this.userId = ko.observable();
    this.roomName = ko.observable();

    this.userNameLoaderVisible = ko.observable(false);
    this.loginBoxVisible = ko.observable(true);

    this.onAfterLogin = function() {  };
    this.userId.subscribe(function() {
        this.onAfterLogin();
    }, this);

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
        // replace it with another loader?
        this.userNameLoaderVisible(true);
        this.prepareSocket($.proxy(function() {
            this.userNameLoaderVisible(false);
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
            this.userNameLoaderVisible(false);
        }, this));

        this.socket.on('error', function(data) {
            console.log('socket error:', data);
        });

        this.socket.on('welcome', $.proxy(function(data) {
            console.log('welcome', data);
            this.roomName(data.roomName);
            this.users(this.prepareUserData(data.users));
            this.userNameLoaderVisible(false);
            this.loginBoxVisible(false);
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
            $.each(this.users(), function(i, u) {
                if (u.id == data.id) {
                    u.vote(data.vote);
                }
            });
        }, this));

        this.socket.on('reset', $.proxy(function() {
            $.each(this.users(), function(i, u) {
                u.vote(undefined);
            });
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

    this.login = function() {
        // @TODO: check this one!
        if (!/^[a-z0-9-_]+$/i.test(this.userName())) {
            return alert('Username must be [a-z0-9-_\.]+'); 
        }
        this.userNameLoaderVisible(true);
        if (!this.userId()) {
            this.socket.emit('set_name', { name: this.userName() });
        } else {
            this.userId.valueHasMutated();
        }
    }

    this.resetRoom = function() {
        this.socket.emit('reset', { roomName: this.roomName() }); 
    }

    this.showInviteDialog = function() {
        alert('not implemented');
    }


    // dom elements listeners
    this.onEnterClick = function() {
        var rn = prompt("Enter room name");
        if (!rn || /^\s*$/.test(rn)) {
            return;
        }
        this.onAfterLogin = $.proxy(function() {
            this.socket.emit('join', {roomName: rn});
        }, this);
        this.login();
        // see this.userId.subsribe to follow up next steps
    }

    this.onCreateRoomClick = function() {
        this.onAfterLogin = $.proxy(function() { 
            this.socket.emit('join');
        }, this);
        this.login();
        // see this.userId.subsribe to follow up next steps
    }

    this.onVoteCardClick = function(vote) {
        vm.socket.emit('vote', { roomName: vm.roomName(), vote: vote });
    }

}

$(function() {
    ko.applyBindings(window.vm = new _vm());
    vm.init();
});
