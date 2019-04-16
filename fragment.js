const { render, html, svg } = lighterhtml;

class Fragment {
    /**
     * @param {Node|Fragment} parent
     * @param {...mixed} args
     */
    constructor(parent, ...args) {
        /**
         * Keep track of parent element for rerendering
         */
        this.parent = parent;

        /**
         * Prepare data, all fields set in this constructor will be captured
         */
        this.watch(...args);

        /**
         * Define getters/setters to rerender when data changes
         */
        this.__observed = {};
        for (let key in this) {
            if (key != "__observed" && key != "parent") {
                /**
                 * Redirect lookup and save
                 */
                this.__observed[key] = this[key];

                /**
                 * Observe child object updates (1 level deep, enough for lists)
                 */
                if (typeof this[key] == "object") {
                    this[key] = new Proxy(this[key], {
                        get: (t, k) => t[k],
                        set: (t, k, v) => {
                            t[k] = v;
                            this.render();
                            return true;
                        },
                    });
                }

                /**
                 * Observe direct properties
                 */
                Object.defineProperty(this, key, {
                    get: () => this.__observed[key],
                    set: value => {
                        this.__observed[key] = value;
                        this.render();
                        return true;
                    },
                });
            }
        }

        /**
         * Normal initialization
         */
        this.init(...args);
        this.fragment = null;

        /**
         * Since constructor returns rendering proxy,
         * provide access to both the proxy instance and real instance
         */
        this._real = this;
        this._proxy = new Proxy(() => this._call(), {
            get: (t, k) => this[k],
            set: (t, k, v) => {
                this[k] = v;
                return true;
            },
        });

        return this._proxy;
    }

    /**
     * Render-on-call handler, don't override unless you want to do something extra at render time
     */
    _call() {
        return this.template;
    }

    /**
     * Render handler
     */
    render() {
        if (this.parent instanceof Node) {
            render(this.parent, () => this._call());
        } else {
            this.parent.render();
        }
    }

    afterRender(el) {
        return el;
    }

    /**
     * Unobserved constructor
     */
    init() {}

    /**
     * Observed constructor (auto-rerender)
     */
    watch() {}

    /**
     * Should return: html`...`
     * @return {Node|object}
     */
    template() {}

    /**
     * Plug method
     *
     * @param {string} method
     * @param {function(function, arguments)} plugin
     */
    static plug(method, plugin) {
        let self = this;
        let orig = this.prototype[method];

        if (this.prototype[method] === undefined) {
            Object.defineProperty(this.prototype, method, {
                value: plugin,
            });
            return;
        }

        if (!this.hasOwnProperty("__plugins")) {
            this.__plugins = [];
        }

        if (this.__plugins[method] === undefined) {
            this.__plugins[method] = [];

            this.__plugins[method].push(function(i, ...args) {
                return orig.apply(this, args);
            });

            Object.defineProperty(this.prototype, method, {
                value: function() {
                    return self.__plugins[method][0].apply(this, [
                        0,
                        ...arguments,
                    ]);
                },
            });
        }

        this.__plugins[method].unshift(function(i, ...args) {
            return plugin.apply(this, [
                function() {
                    return self.__plugins[method][i + 1].apply(this, [
                        i + 1,
                        ...arguments,
                    ]);
                }.bind(this),
                ...args,
            ]);
        });
    }

    /**
     * Unplug method
     *
     * @param {string} method
     * @param {function} plugin
     */
    static unplug(method, plugin) {
        if (this.__plugins && this.__plugins[method]) {
            delete this.__plugins[method][
                this.__plugins[method].findIndex(func => func == plugin)
            ];
        }
    }
}
