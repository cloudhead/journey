
//
// Array
//

Array.prototype.first = function() { return this[0] };
Array.prototype.last = function() { return this[this.length - 1] };
Array.prototype.each = function(fun) {
    for (var i = 0; i < this.length; i++) { fun(this[i]) }
    return this;
};
Array.prototype.map = function(fun) {
    var ary = [];
    this.each(function(i) { ary.push(fun(i)) });
    return ary;
};
Array.prototype.select = function(fun) {
    var ary = [];
    this.each(function(i) { if (fun(i)) ary.push(i) });
    return ary;
};
Array.prototype.reject = function(fun) {
    var ary = [];
    this.each(function(i) { if (! fun(i)) ary.push(i) });
    return ary;
};
Array.prototype.compact = function() {
    return this.reject(function(i) {
        return Boolean(i) === false;
    });
};
Array.prototype.include = function(needle) {
    return this.indexOf(needle) == -1 ? false : true;
};
Array.prototype.includes = Array.prototype.include;

Array.prototype.find = function(fun) {
    for (var i = 0; i < this.length; i++) { if (ret = fun(this[i])) return ret; }
    return false;
};

//
// String
//

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.substr(1);
};

String.prototype.trim = function () {
    var str = this.replace(/^\s\s*/, ''),
         ws = /\s/,
          i = str.length;
    while (ws.test(str.charAt(--i)));
    return str.slice(0, i + 1);
};

//
// Object
//
Object.create = function (o) {
    function F() {}
    F.prototype = o;
    return new F();
};
Object.prototype.each = function(fun) {
    for (key in this) {
        if (this.hasOwnProperty(key)) { fun([key, this[key]]) }
    }
    return this;  
};
Object.prototype.include = function (s) {
    return this.hasOwnProperty(s);
};
Object.prototype.all = function (fun) {
    for (key in this) {
        if (this.hasOwnProperty(key)) {
            if (! fun(key, this[key])) { return false }
        }
    }
    return true;
};
Object.prototype.merge = function(other) {
    var obj = this;
    other.each(function(pair) {
        obj[pair[0]] = pair[1];
    });
    return this;
};
Object.prototype.is = function(type) {
    return (this instanceof type) || this.constructor == type || typeof this == type;
};
