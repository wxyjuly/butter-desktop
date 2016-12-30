(function (App) {
    'use strict';

    var SCROLL_MORE = 0.7; // 70% of window height
    var NUM_MOVIES_IN_ROW = 7;

    function elementInViewport(container, element) {
        if (element.length === 0) {
            return;
        }
        var $container = $(container),
            $el = $(element);

        var docViewTop = $container.offset().top;
        var docViewBottom = docViewTop + $container.height();

        var elemTop = $el.offset().top;
        var elemBottom = elemTop + $el.height();

        return ((elemBottom >= docViewTop) && (elemTop <= docViewBottom) && (elemBottom <= docViewBottom) && (elemTop >= docViewTop));
    }

    var ErrorView = Backbone.Marionette.ItemView.extend({
        template: '#movie-error-tpl',
        ui: {
            retryButton: '.retry-button',
            onlineSearch: '.online-search'
        },
        onBeforeRender: function () {
            this.model.set('error', this.error);
        },
        onRender: function () {
            if (this.retry) {
                switch (App.currentview) {
                case 'Watchlist':
                    this.ui.retryButton.css('visibility', 'visible');
                    this.ui.retryButton.css('margin-left', 'calc(50% - 100px)');
                    break;
                default:
                    this.ui.onlineSearch.css('visibility', 'visible');
                    this.ui.retryButton.css('visibility', 'visible');
                    break;
                }
            }
        }
    });

    var List = Backbone.Marionette.CompositeView.extend({
        template: '#list-tpl',

        tagName: 'ul',
        className: 'list',

        childView: App.View.Item,
        childViewContainer: '.items',

        events: {
            'scroll': 'onScroll',
            'mousewheel': 'onScroll',
            'keydown': 'onScroll'
        },

        ui: {
            spinner: '.spinner'
        },

        isEmpty: function () {
            return !this.collection.length && this.collection.state !== 'loading';
        },

        getEmptyView: function () {
            switch (App.currentview) {
                case 'Favorites':
                    if (this.collection.state === 'error') {
                        return ErrorView.extend({
                            retry: true,
                            error: i18n.__('Error, database is probably corrupted. Try flushing the bookmarks in settings.')
                        });
                    } else if (this.collection.state !== 'loading') {
                        return ErrorView.extend({
                            error: i18n.__('No ' + App.currentview + ' found...')
                        });
                    }
                    break;
                case 'Watchlist':
                    if (this.collection.state === 'error') {
                        return ErrorView.extend({
                            retry: true,
                            error: i18n.__('This feature only works if you have your TraktTv account synced. Please go to Settings and enter your credentials.')
                        });
                    } else if (this.collection.state !== 'loading') {
                        return ErrorView.extend({
                            error: i18n.__('No ' + App.currentview + ' found...')
                        });
                    }
                    break;
                default:
                    if (this.collection.state === 'error') {
                        return ErrorView.extend({
                            retry: true,
                            error: i18n.__('The remote ' + App.currentview + ' API failed to respond, please check %s and try again later', '<a class="links" href="' + Settings.statusUrl + '">' + Settings.statusUrl + '</a>')
                        });
                    } else if (this.collection.state !== 'loading') {
                        return ErrorView.extend({
                            error: i18n.__('No ' + App.currentview + ' found...')
                        });
                    }
                    break;
            }
        },

        initialize: function () {
            this.listenTo(this.collection, 'loading', this.onLoading);
            this.listenTo(this.collection, 'loaded', this.onLoaded);

            App.vent.on('shortcuts:list', this.initKeyboardShortcuts.bind(this));
            this.initKeyboardShortcuts();

            this.initPosterResizeKeys();
        },

        initKeyboardShortcuts: function () {
            Mousetrap.bind('up', this.moveUp.bind(this));
            Mousetrap.bind('down', this.moveDown.bind(this));
            Mousetrap.bind('left', this.moveLeft.bind(this));
            Mousetrap.bind('right', this.moveRight.bind(this));
            Mousetrap.bind('f', this.toggleSelectedFavourite);
            Mousetrap.bind('w', this.toggleSelectedWatched);
            Mousetrap.bind(['enter', 'space'], this.selectItem);
            Mousetrap.bind(['ctrl+f', 'command+f'], this.focusSearch);
            Mousetrap(document.querySelector('input')).bind(['ctrl+f', 'command+f', 'esc'], this.blurSearch);
            Mousetrap.bind(['tab', 'shift+tab'], this.switchTab.bind(this));
            Mousetrap.bind(['ctrl+1', 'ctrl+2', 'ctrl+3'], this.switchSpecificTab.bind(this));
            Mousetrap.bind(['`', 'b'], this.openFavorites.bind(this));
            Mousetrap.bind('i', this.showAbout.bind(this));
        },

        blurSearch: function (e, combo) {
            $('.search-input>input').blur();
        },

        isPlayerDestroyed: function () {
            return (App.PlayerView === undefined || App.PlayerView.isDestroyed) 
                && $('#about-container').children().length <= 0 
                && $('#player').children().length <= 0;
        },

        selectTab: function (direction, currentTab) {
            var tabs = App.Config.getTabTypes();
            var i = currentTab ? tabs.indexOf(currentTab) : -1;
            var nextTab = tabs[(tabs.length + i + direction) % tabs.length];

            App.vent.trigger('about:close');
            App.vent.trigger('torrentCollection:close');
            App.vent.trigger('show:tab', nextTab);
        },

        switchTab: function (e, combo) {
            if (this.isPlayerDestroyed()) {
                if (combo === 'tab') {
                    this.selectTab(+1, App.currentview);
                } else if (combo === 'shift+tab') {
                    this.selectTab(-1, App.currentview);
                }
            }
        },

        switchSpecificTab: function (e, combo) {
            if (this.isPlayerDestroyed()) {
                this.selectTab(combo.substr(-1));
            }
        },

        refreshFilterbar: function () {
            App.vent.trigger('torrentCollection:close');
            App.vent.trigger(App.currentview + ':list', []);
            $('.filter-bar').find('.active').removeClass('active');
            $('.source.show' + App.currentview.charAt(0).toUpperCase() + App.currentview.slice(1)).addClass('active');
        },

        openFavorites: function () {
            if (this.isPlayerDestroyed()) {
                $('.favorites').click();
            }
        },

        showAbout: function () {
            if (this.isPlayerDestroyed()) {
                $('.about').click();
            }
        },

        initPosterResizeKeys: function () {
            $(window)
                .on('mousewheel', (event) => { // Ctrl + wheel doesnt seems to be working on node-webkit (works just fine on chrome)
                    if (event.altKey === true) {
                        event.preventDefault();
                        if (event.originalEvent.wheelDelta > 0) {
                            this.increasePoster();
                        } else {
                            this.decreasePoster();
                        }
                    }
                })
                .on('keydown', (event) => {
                    if (event.ctrlKey === true || event.metaKey === true) {

                        if ($.inArray(event.keyCode, [107, 187]) !== -1) {
                            this.increasePoster();
                            return false;

                        } else if ($.inArray(event.keyCode, [109, 189]) !== -1) {
                            this.decreasePoster();
                            return false;
                        }
                    }
                });
        },

        onShow: function () {
            if (this.collection.state === 'loading') {
                this.onLoading();
            }
        },
        allLoaded: function () {
            return this.collection.providers.torrents
                .reduce((a, c) => (
                    a && c.loaded
                ), true);
        },
        onLoading: function () {
            $('.status-loadmore').hide();
            $('#loading-more-animi').show();
        },

        onLoaded: function () {
            App.vent.trigger('list:loaded');
            var self = this;

            this.completerow();

            if (typeof (this.ui.spinner) === 'object') {
                this.ui.spinner.hide();
            }

            if (this.allLoaded()) {
                $('#loading-more-animi').hide();
                $('.status-loadmore').show();
            }

            $('.filter-bar').on('mousedown', function (e) {
                if (e.target.localName !== 'div') {
                    return;
                }
                _.defer(function () {
                    self.$('.items:first').focus();
                });
            });
            $('.items').attr('tabindex', '1');
            _.defer(function () {
                self.checkFetchMore();
                self.$('.items:first').focus();
            });

        },

        checkFetchMore: function () {
            var loadmore = $(document.getElementById('load-more-item'));

            return ( // if load more is visible onLoaded, fetch more results
                loadmore.is(':visible') &&
                elementInViewport(this.$el, loadmore)
            ) ? this.collection.fetchMore() : false;
        },

        completerow: function () {
            var items = $(document.getElementsByClassName('items'));

            var loadmore = 
                '<div id="load-more-item" class="load-more">' +
                    '<span class="status-loadmore">' + 
                        i18n.__('Load More') + 
                    '</span>' +
                    '<div id="loading-more-animi" class="loading-container">' +
                        '<div class="ball"></div>' +
                        '<div class="ball1"></div>' +
                    '</div>' +
                '</div>';

            var ghosts = '<div class="ghost"></div>'.repeat(10);

            items.children('#load-more-item').remove();
            items.children('.ghost').remove();

            items.append(loadmore + ghosts);

            this.showloadmore();
        },

        showloadmore: function () {
            if (
                ['movie', 'tvshow', 'anime'].indexOf(App.currentview) !== -1
                && this.collection.hasMore
                && !this.collection.filter.keywords
                && this.collection.state !== 'error'
                && this.collection.length
            ) {
                var loadmore = $(document.getElementById('load-more-item'));
                loadmore.css('display', 'inline-block').click(_ => {
                    loadmore.off('click');
                    this.collection.fetchMore();
                });
            }
        },

        onScroll: function () {
            if (!this.collection.hasMore) {
                return;
            }

            var totalHeight = this.$el.prop('scrollHeight');
            var currentPosition = this.$el.scrollTop() + this.$el.height();

            if (this.collection.state === 'loaded' &&
                (currentPosition / totalHeight) > SCROLL_MORE) {
                this.collection.fetchMore();
            }
        },

        focusSearch: function (e) {
            $('.search-input>input').focus();
        },

        increasePoster: function (e) {
            var postersWidthIndex = Settings.postersJump.indexOf(parseInt(Settings.postersWidth));

            if (postersWidthIndex !== -1 && postersWidthIndex + 1 in Settings.postersJump) {
                App.db.writeSetting({
                        key: 'postersWidth',
                        value: Settings.postersJump[postersWidthIndex + 1]
                    })
                    .then(function () {
                        App.vent.trigger('updatePostersSizeStylesheet');
                    });
            } else {
                // do nothing for now
            }
        },

        decreasePoster: function (e) {
            var postersWidth;
            var postersWidthIndex = Settings.postersJump.indexOf(parseInt(Settings.postersWidth));

            if (postersWidthIndex !== -1 && postersWidthIndex - 1 in Settings.postersJump) {
                postersWidth = Settings.postersJump[postersWidthIndex - 1];
            } else {
                postersWidth = Settings.postersJump[0];
            }

            App.db.writeSetting({
                    key: 'postersWidth',
                    value: postersWidth
                })
                .then(function () {
                    App.vent.trigger('updatePostersSizeStylesheet');
                });
        },


        selectItem: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            $('.item.selected .cover').trigger('click');
        },

        selectIndex: function (index) {
            if ($('.items .item').eq(index).length === 0 || $('.items .item').eq(index).children().length === 0) {
                return;
            }
            $('.item.selected').removeClass('selected');
            $('.items .item').eq(index).addClass('selected');

            var $movieEl = $('.item.selected')[0];
            if (!elementInViewport(this.$el, $movieEl)) {
                $movieEl.scrollIntoView(false);
                this.onScroll();
            }
        },

        moveUp: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            var index = $('.item.selected').index();
            if (index === -1) {
                index = 0;
            } else {
                index = index - NUM_MOVIES_IN_ROW;
            }
            if (index < 0) {
                return;
            }
            this.selectIndex(index);
        },

        moveDown: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            var index = $('.item.selected').index();
            if (index === -1) {
                index = 0;
            } else {
                index = index + NUM_MOVIES_IN_ROW;
            }
            this.selectIndex(index);
        },

        moveLeft: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            var index = $('.item.selected').index();
            if (index === -1) {
                index = 0;
            } else if (index === 0) {
                index = 0;
            } else {
                index = index - 1;
            }
            this.selectIndex(index);
        },

        moveRight: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            var index = $('.item.selected').index();
            if (index === -1) {
                index = 0;
            } else {
                index = index + 1;
            }
            this.selectIndex(index);
        },

        toggleSelectedFavourite: function (e) {
            $('.item.selected .actions-favorites').click();
        },

        toggleSelectedWatched: function (e) {
            $('.item.selected .actions-watched').click();
        },
    });

    function onMoviesWatched(movie, channel) {
        if  (channel === 'database') {
            try {
                switch (Settings.watchedCovers) {
                    case 'fade':
                        $('li[data-imdb-id="' + App.MovieDetailView.model.get('imdb_id') + '"] .actions-watched').addClass('selected');
                        $('li[data-imdb-id="' + App.MovieDetailView.model.get('imdb_id') + '"]').addClass('watched');
                        break;
                    case 'hide':
                        $('li[data-imdb-id="' + App.MovieDetailView.model.get('imdb_id') + '"]').remove();
                        break;
                }
                $('.watched-toggle').addClass('selected').text(i18n.__('Seen'));
                App.MovieDetailView.model.set('watched', true);
            } catch (e) {}
        }
    }

    App.vent.on('movie:watched', onMoviesWatched);

    App.View.List = List;
})(window.App);
