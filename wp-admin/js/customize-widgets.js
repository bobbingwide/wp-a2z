/**
 * @output wp-admin/js/customize-widgets.js
 */

/* global _wpCustomizeWidgetsSettings */
(function( wp, $ ){

	if ( ! wp || ! wp.customize ) { return; }

	// Set up our namespace...
	var api = wp.customize,
		l10n;

	/**
	 * @namespace wp.customize.Widgets
	 */
	api.Widgets = api.Widgets || {};
	api.Widgets.savedWidgetIds = {};

	// Link settings.
	api.Widgets.data = _wpCustomizeWidgetsSettings || {};
	l10n = api.Widgets.data.l10n;

	/**
	 * wp.customize.Widgets.WidgetModel
	 *
	 * A single widget model.
	 *
	 * @class    wp.customize.Widgets.WidgetModel
	 * @augments Backbone.Model
	 */
	api.Widgets.WidgetModel = Backbone.Model.extend(/** @lends wp.customize.Widgets.WidgetModel.prototype */{
		id: null,
		temp_id: null,
		classname: null,
		control_tpl: null,
		description: null,
		is_disabled: null,
		is_multi: null,
		multi_number: null,
		name: null,
		id_base: null,
		transport: null,
		params: [],
		width: null,
		height: null,
		search_matched: true
	});

	/**
	 * wp.customize.Widgets.WidgetCollection
	 *
	 * Collection for widget models.
	 *
	 * @class    wp.customize.Widgets.WidgetCollection
	 * @augments Backbone.Collection
	 */
	api.Widgets.WidgetCollection = Backbone.Collection.extend(/** @lends wp.customize.Widgets.WidgetCollection.prototype */{
		model: api.Widgets.WidgetModel,

		// Controls searching on the current widget collection
		// and triggers an update event.
		doSearch: function( value ) {

			// Don't do anything if we've already done this search.
			// Useful because the search handler fires multiple times per keystroke.
			if ( this.terms === value ) {
				return;
			}

			// Updates terms with the value passed.
			this.terms = value;

			// If we have terms, run a search...
			if ( this.terms.length > 0 ) {
				this.search( this.terms );
			}

			// If search is blank, set all the widgets as they matched the search to reset the views.
			if ( this.terms === '' ) {
				this.each( function ( widget ) {
					widget.set( 'search_matched', true );
				} );
			}
		},

		// Performs a search within the collection.
		// @uses RegExp
		search: function( term ) {
			var match, haystack;

			// Escape the term string for RegExp meta characters.
			term = term.replace( /[-\/\\^$*+?.()|[\]{}]/g, '\\$&' );

			// Consider spaces as word delimiters and match the whole string
			// so matching terms can be combined.
			term = term.replace( / /g, ')(?=.*' );
			match = new RegExp( '^(?=.*' + term + ').+', 'i' );

			this.each( function ( data ) {
				haystack = [ data.get( 'name' ), data.get( 'description' ) ].join( ' ' );
				data.set( 'search_matched', match.test( haystack ) );
			} );
		}
	});
	api.Widgets.availableWidgets = new api.Widgets.WidgetCollection( api.Widgets.data.availableWidgets );

	/**
	 * wp.customize.Widgets.SidebarModel
	 *
	 * A single sidebar model.
	 *
	 * @class    wp.customize.Widgets.SidebarModel
	 * @augments Backbone.Model
	 */
	api.Widgets.SidebarModel = Backbone.Model.extend(/** @lends wp.customize.Widgets.SidebarModel.prototype */{
		after_title: null,
		after_widget: null,
		before_title: null,
		before_widget: null,
		'class': null,
		description: null,
		id: null,
		name: null,
		is_rendered: false
	});

	/**
	 * wp.customize.Widgets.SidebarCollection
	 *
	 * Collection for sidebar models.
	 *
	 * @class    wp.customize.Widgets.SidebarCollection
	 * @augments Backbone.Collection
	 */
	api.Widgets.SidebarCollection = Backbone.Collection.extend(/** @lends wp.customize.Widgets.SidebarCollection.prototype */{
		model: api.Widgets.SidebarModel
	});
	api.Widgets.registeredSidebars = new api.Widgets.SidebarCollection( api.Widgets.data.registeredSidebars );

	api.Widgets.AvailableWidgetsPanelView = wp.Backbone.View.extend(/** @lends wp.customize.Widgets.AvailableWidgetsPanelView.prototype */{

		el: '#available-widgets',

		events: {
			'input #widgets-search': 'search',
			'focus .widget-tpl' : 'focus',
			'click .widget-tpl' : '_submit',
			'keypress .widget-tpl' : '_submit',
			'keydown' : 'keyboardAccessible'
		},

		// Cache current selected widget.
		selected: null,

		// Cache sidebar control which has opened panel.
		currentSidebarControl: null,
		$search: null,
		$clearResults: null,
		searchMatchesCount: null,

		/**
		 * View class for the available widgets panel.
		 *
		 * @constructs wp.customize.Widgets.AvailableWidgetsPanelView
		 * @augments   wp.Backbone.View
		 */
		initialize: function() {
			var self = this;

			this.$search = $( '#widgets-search' );

			this.$clearResults = this.$el.find( '.clear-results' );

			_.bindAll( this, 'close' );

			this.listenTo( this.collection, 'change', this.updateList );

			this.updateList();

			// Set the initial search count to the number of available widgets.
			this.searchMatchesCount = this.collection.length;

			/*
			 * If the available widgets panel is open and the customize controls
			 * are interacted with (i.e. available widgets panel is blurred) then
			 * close the available widgets panel. Also close on back button click.
			 */
			$( '#customize-controls, #available-widgets .customize-section-title' ).on( 'click keydown', function( e ) {
				var isAddNewBtn = $( e.target ).is( '.add-new-widget, .add-new-widget *' );
				if ( $( 'body' ).hasClass( 'adding-widget' ) && ! isAddNewBtn ) {
					self.close();
				}
			} );

			// Clear the search results and trigger an `input` event to fire a new search.
			this.$clearResults.on( 'click', function() {
				self.$search.val( '' ).focus().trigger( 'input' );
			} );

			// Close the panel if the URL in the preview changes.
			api.previewer.bind( 'url', this.close );
		},

		/**
		 * Performs a search and handles selected widget.
		 */
		search: _.debounce( function( event ) {
			var firstVisible;

			this.collection.doSearch( event.target.value );
			// Update the search matches count.
			this.updateSearchMatchesCount();
			// Announce how many search results.
			this.announceSearchMatches();

			// Remove a widget from being selected if it is no longer visible.
			if ( this.selected && ! this.selected.is( ':visible' ) ) {
				this.selected.removeClass( 'selected' );
				this.selected = null;
			}

			// If a widget was selected but the filter value has been cleared out, clear selection.
			if ( this.selected && ! event.target.value ) {
				this.selected.removeClass( 'selected' );
				this.selected = null;
			}

			// If a filter has been entered and a widget hasn't been selected, select the first one shown.
			if ( ! this.selected && event.target.value ) {
				firstVisible = this.$el.find( '> .widget-tpl:visible:first' );
				if ( firstVisible.length ) {
					this.select( firstVisible );
				}
			}

			// Toggle the clear search results button.
			if ( '' !== event.target.value ) {
				this.$clearResults.addClass( 'is-visible' );
			} else if ( '' === event.target.value ) {
				this.$clearResults.removeClass( 'is-visible' );
			}

			// Set a CSS class on the search container when there are no search results.
			if ( ! this.searchMatchesCount ) {
				this.$el.addClass( 'no-widgets-found' );
			} else {
				this.$el.removeClass( 'no-widgets-found' );
			}
		}, 500 ),

		/**
		 * Updates the count of the available widgets that have the `search_matched` attribute.
 		 */
		updateSearchMatchesCount: function() {
			this.searchMatchesCount = this.collection.where({ search_matched: true }).length;
		},

		/**
		 * Sends a message to the aria-live region to announce how many search results.
		 */
		announceSearchMatches: function() {
			var message = l10n.widgetsFound.replace( '%d', this.searchMatchesCount ) ;

			if ( ! this.searchMatchesCount ) {
				message = l10n.noWidgetsFound;
			}

			wp.a11y.speak( message );
		},

		/**
		 * Changes visibility of available widgets.
 		 */
		updateList: function() {
			this.collection.each( function( widget ) {
				var widgetTpl = $( '#widget-tpl-' + widget.id );
				widgetTpl.toggle( widget.get( 'search_matched' ) && ! widget.get( 'is_disabled' ) );
				if ( widget.get( 'is_disabled' ) && widgetTpl.is( this.selected ) ) {
					this.selected = null;
				}
			} );
		},

		/**
		 * Highlights a widget.
 		 */
		select: function( widgetTpl ) {
			this.selected = $( widgetTpl );
			this.selected.siblings( '.widget-tpl' ).removeClass( 'selected' );
			this.selected.addClass( 'selected' );
		},

		/**
		 * Highlights a widget on focus.
		 */
		focus: function( event ) {
			this.select( $( event.currentTarget ) );
		},

		/**
		 * Handles submit for keypress and click on widget.
		 */
		_submit: function( event ) {
			// Only proceed with keypress if it is Enter or Spacebar.
			if ( event.type === 'keypress' && ( event.which !== 13 && event.which !== 32 ) ) {
				return;
			}

			this.submit( $( event.currentTarget ) );
		},

		/**
		 * Adds a selected widget to the sidebar.
 		 */
		submit: function( widgetTpl ) {
			var widgetId, widget, widgetFormControl;

			if ( ! widgetTpl ) {
				widgetTpl = this.selected;
			}

			if ( ! widgetTpl || ! this.currentSidebarControl ) {
				return;
			}

			this.select( widgetTpl );

			widgetId = $( this.selected ).data( 'widget-id' );
			widget = this.collection.findWhere( { id: widgetId } );
			if ( ! widget ) {
				return;
			}

			widgetFormControl = this.currentSidebarControl.addWidget( widget.get( 'id_base' ) );
			if ( widgetFormControl ) {
				widgetFormControl.focus();
			}

			this.close();
		},

		/**
		 * Opens the panel.
		 */
		open: function( sidebarControl ) {
			this.currentSidebarControl = sidebarControl;

			// Wide widget controls appear over the preview, and so they need to be collapsed when the panel opens.
			_( this.currentSidebarControl.getWidgetFormControls() ).each( function( control ) {
				if ( control.params.is_wide ) {
					control.collapseForm();
				}
			} );

			if ( api.section.has( 'publish_settings' ) ) {
				api.section( 'publish_settings' ).collapse();
			}

			$( 'body' ).addClass( 'adding-widget' );

			this.$el.find( '.selected' ).removeClass( 'selected' );

			// Reset search.
			this.collection.doSearch( '' );

			if ( ! api.settings.browser.mobile ) {
				this.$search.focus();
			}
		},

		/**
		 * Closes the panel.
		 */
		close: function( options ) {
			options = options || {};

			if ( options.returnFocus && this.currentSidebarControl ) {
				this.currentSidebarControl.container.find( '.add-new-widget' ).focus();
			}

			this.currentSidebarControl = null;
			this.selected = null;

			$( 'body' ).removeClass( 'adding-widget' );

			this.$search.val( '' ).trigger( 'input' );
		},

		/**
		 * Adds keyboard accessiblity to the panel.
		 */
		keyboardAccessible: function( event ) {
			var isEnter = ( event.which === 13 ),
				isEsc = ( event.which === 27 ),
				isDown = ( event.which === 40 ),
				isUp = ( event.which === 38 ),
				isTab = ( event.which === 9 ),
				isShift = ( event.shiftKey ),
				selected = null,
				firstVisible = this.$el.find( '> .widget-tpl:visible:first' ),
				lastVisible = this.$el.find( '> .widget-tpl:visible:last' ),
				isSearchFocused = $( event.target ).is( this.$search ),
				isLastWidgetFocused = $( event.target ).is( '.widget-tpl:visible:last' );

			if ( isDown || isUp ) {
				if ( isDown ) {
					if ( isSearchFocused ) {
						selected = firstVisible;
					} else if ( this.selected && this.selected.nextAll( '.widget-tpl:visible' ).length !== 0 ) {
						selected = this.selected.nextAll( '.widget-tpl:visible:first' );
					}
				} else if ( isUp ) {
					if ( isSearchFocused ) {
						selected = lastVisible;
					} else if ( this.selected && this.selected.prevAll( '.widget-tpl:visible' ).length !== 0 ) {
						selected = this.selected.prevAll( '.widget-tpl:visible:first' );
					}
				}

				this.select( selected );

				if ( selected ) {
					selected.focus();
				} else {
					this.$search.focus();
				}

				return;
			}

			// If enter pressed but nothing entered, don't do anything.
			if ( isEnter && ! this.$search.val() ) {
				return;
			}

			if ( isEnter ) {
				this.submit();
			} else if ( isEsc ) {
				this.close( { returnFocus: true } );
			}

			if ( this.currentSidebarControl && isTab && ( isShift && isSearchFocused || ! isShift && isLastWidgetFocused ) ) {
				this.currentSidebarControl.container.find( '.add-new-widget' ).focus();
				event.preventDefault();
			}
		}
	});

	/**
	 * Handlers for the widget-synced event, organized by widget ID base.
	 * Other widgets may provide their own update handlers by adding
	 * listeners for the widget-synced event.
	 *
	 * @alias    wp.customize.Widgets.formSyncHandlers
	 */
	api.Widgets.formSyncHandlers = {

		/**
		 * @param {jQuery.Event} e
		 * @param {jQuery} widget
		 * @param {string} newForm
		 */
		rss: function( e, widget, newForm ) {
			var oldWidgetError = widget.find( '.widget-error:first' ),
				newWidgetError = $( '<div>' + newForm + '</div>' ).find( '.widget-error:first' );

			if ( oldWidgetError.length && newWidgetError.length ) {
				oldWidgetError.replaceWith( newWidgetError );
			} else if ( oldWidgetError.length ) {
				oldWidgetError.remove();
			} else if ( newWidgetError.length ) {
				widget.find( '.widget-content:first' ).prepend( newWidgetError );
			}
		}
	};

	api.Widgets.WidgetControl = api.Control.extend(/** @lends wp.customize.Widgets.WidgetControl.prototype */{
		defaultExpandedArguments: {
			duration: 'fast',
			completeCallback: $.noop
		},

		/**
		 * wp.customize.Widgets.WidgetControl
		 *
		 * Customizer control for widgets.
		 * Note that 'widget_form' must match the WP_Widget_Form_Customize_Control::$type
		 *
		 * @since 4.1.0
		 *
		 * @constructs wp.customize.Widgets.WidgetControl
		 * @augments   wp.customize.Control
		 */
		initialize: function( id, options ) {
			var control = this;

			control.widgetControlEmbedded = false;
			control.widgetContentEmbedded = false;
			control.expanded = new api.Value( false );
			control.expandedArgumentsQueue = [];
			control.expanded.bind( function( expanded ) {
				var args = control.expandedArgumentsQueue.shift();
				args = $.extend( {}, control.defaultExpandedArguments, args );
				control.onChangeExpanded( expanded, args );
			});
			control.altNotice = true;

			api.Control.prototype.initialize.call( control, id, options );
		},

		/**
		 * Set up the control.
		 *
		 * @since 3.9.0
		 */
		ready: function() {
			var control = this;

			/*
			 * Embed a placeholder once the section is expanded. The full widget
			 * form content will be embedded once the control itself is expanded,
			 * and at this point the widget-added event will be triggered.
			 */
			if ( ! control.section() ) {
				control.embedWidgetControl();
			} else {
				api.section( control.section(), function( section ) {
					var onExpanded = function( isExpanded ) {
						if ( isExpanded ) {
							control.embedWidgetControl();
							section.expanded.unbind( onExpanded );
						}
					};
					if ( section.expanded() ) {
						onExpanded( true );
					} else {
						section.expanded.bind( onExpanded );
					}
				} );
			}
		},

		/**
		 * Embed the .widget element inside the li container.
		 *
		 * @since 4.4.0
		 */
		embedWidgetControl: function() {
			var control = this, widgetControl;

			if ( control.widgetControlEmbedded ) {
				return;
			}
			control.widgetControlEmbedded = true;

			widgetControl = $( control.params.widget_control );
			control.container.append( widgetControl );

			control._setupModel();
			control._setupWideWidget();
			control._setupControlToggle();

			control._setupWidgetTitle();
			control._setupReorderUI();
			control._setupHighlightEffects();
			control._setupUpdateUI();
			control._setupRemoveUI();
		},

		/**
		 * Embed the actual widget form inside of .widget-content and finally trigger the widget-added event.
		 *
		 * @since 4.4.0
		 */
		embedWidgetContent: function() {
			var control = this, widgetContent;

			control.embedWidgetControl();
			if ( control.widgetContentEmbedded ) {
				return;
			}
			control.widgetContentEmbedded = true;

			// Update the notification container element now that the widget content has been embedded.
			control.notifications.container = control.getNotificationsContainerElement();
			control.notifications.render();

			widgetContent = $( control.params.widget_content );
			control.container.find( '.widget-content:first' ).append( widgetContent );

			/*
			 * Trigger widget-added event so that plugins can attach any event
			 * listeners and dynamic UI elements.
			 */
			$( document ).trigger( 'widget-added', [ control.container.find( '.widget:first' ) ] );

		},

		/**
		 * Handle changes to the setting
		 */
		_setupModel: function() {
			var self = this, rememberSavedWidgetId;

			// Remember saved widgets so we know which to trash (move to inactive widgets sidebar).
			rememberSavedWidgetId = function() {
				api.Widgets.savedWidgetIds[self.params.widget_id] = true;
			};
			api.bind( 'ready', rememberSavedWidgetId );
			api.bind( 'saved', rememberSavedWidgetId );

			this._updateCount = 0;
			this.isWidgetUpdating = false;
			this.liveUpdateMode = true;

			// Update widget whenever model changes.
			this.setting.bind( function( to, from ) {
				if ( ! _( from ).isEqual( to ) && ! self.isWidgetUpdating ) {
					self.updateWidget( { instance: to } );
				}
			} );
		},

		/**
		 * Add special behaviors for wide widget controls
		 */
		_setupWideWidget: function() {
			var self = this, $widgetInside, $widgetForm, $customizeSidebar,
				$themeControlsContainer, positionWidget;

			if ( ! this.params.is_wide || $( window ).width() <= 640 /* max-width breakpoint in customize-controls.css */ ) {
				return;
			}

			$widgetInside = this.container.find( '.widget-inside' );
			$widgetForm = $widgetInside.find( '> .form' );
			$customizeSidebar = $( '.wp-full-overlay-sidebar-content:first' );
			this.container.addClass( 'wide-widget-control' );

			this.container.find( '.form:first' ).css( {
				'max-width': this.params.width,
				'min-height': this.params.height
			} );

			/**
			 * Keep the widget-inside positioned so the top of fixed-positioned
			 * element is at the same top position as the widget-top. When the
			 * widget-top is scrolled out of view, keep the widget-top in view;
			 * likewise, don't allow the widget to drop off the bottom of the window.
			 * If a widget is too tall to fit in the window, don't let the height
			 * exceed the window height so that the contents of the widget control
			 * will become scrollable (overflow:auto).
			 */
			positionWidget = function() {
				var offsetTop = self.container.offset().top,
					windowHeight = $( window ).height(),
					formHeight = $widgetForm.outerHeight(),
					top;
				$widgetInside.css( 'max-height', windowHeight );
				top = Math.max(
					0, // Prevent top from going off screen.
					Math.min(
						Math.max( offsetTop, 0 ), // Distance widget in panel is from top of screen.
						windowHeight - formHeight // Flush up against bottom of screen.
					)
				);
				$widgetInside.css( 'top', top );
			};

			$themeControlsContainer = $( '#customize-theme-controls' );
			this.container.on( 'expand', function() {
				positionWidget();
				$customizeSidebar.on( 'scroll', positionWidget );
				$( window ).on( 'resize', positionWidget );
				$themeControlsContainer.on( 'expanded collapsed', positionWidget );
			} );
			this.container.on( 'collapsed', function() {
				$customizeSidebar.off( 'scroll', positionWidget );
				$( window ).off( 'resize', positionWidget );
				$themeControlsContainer.off( 'expanded collapsed', positionWidget );
			} );

			// Reposition whenever a sidebar's widgets are changed.
			api.each( function( setting ) {
				if ( 0 === setting.id.indexOf( 'sidebars_widgets[' ) ) {
					setting.bind( function() {
						if ( self.container.hasClass( 'expanded' ) ) {
							positionWidget();
						}
					} );
				}
			} );
		},

		/**
		 * Show/hide the control when clicking on the form title, when clicking
		 * the close button
		 */
		_setupControlToggle: function() {
			var self = this, $closeBtn;

			this.container.find( '.widget-top' ).on( 'click', function( e ) {
				e.preventDefault();
				var sidebarWidgetsControl = self.getSidebarWidgetsControl();
				if ( sidebarWidgetsControl.isReordering ) {
					return;
				}
				self.expanded( ! self.expanded() );
			} );

			$closeBtn = this.container.find( '.widget-control-close' );
			$closeBtn.on( 'click', function() {
				self.collapse();
				self.container.find( '.widget-top .widget-action:first' ).focus(); // Keyboard accessibility.
			} );
		},

		/**
		 * Update the title of the form if a title field is entered
		 */
		_setupWidgetTitle: function() {
			var self = this, updateTitle;

			updateTitle = function() {
				var title = self.setting().title,
					inWidgetTitle = self.container.find( '.in-widget-title' );

				if ( title ) {
					inWidgetTitle.text( ': ' + title );
				} else {
					inWidgetTitle.text( '' );
				}
			};
			this.setting.bind( updateTitle );
			updateTitle();
		},

		/**
		 * Set up the widget-reorder-nav
		 */
		_setupReorderUI: function() {
			var self = this, selectSidebarItem, $moveWidgetArea,
				$reorderNav, updateAvailableSidebars, template;

			/**
			 * select the provided sidebar list item in the move widget area
			 *
			 * @param {jQuery} li
			 */
			selectSidebarItem = function( li ) {
				li.siblings( '.selected' ).removeClass( 'selected' );
				li.addClass( 'selected' );
				var isSelfSidebar = ( li.data( 'id' ) === self.params.sidebar_id );
				self.container.find( '.move-widget-btn' ).prop( 'disabled', isSelfSidebar );
			};

			/**
			 * Add the widget reordering elements to the widget control
			 */
			this.container.find( '.widget-title-action' ).after( $( api.Widgets.data.tpl.widgetReorderNav ) );


			template = _.template( api.Widgets.data.tpl.moveWidgetArea );
			$moveWidgetArea = $( template( {
					sidebars: _( api.Widgets.registeredSidebars.toArray() ).pluck( 'attributes' )
				} )
			);
			this.container.find( '.widget-top' ).after( $moveWidgetArea );

			/**
			 * Update available sidebars when their rendered state changes
			 */
			updateAvailableSidebars = function() {
				var $sidebarItems = $moveWidgetArea.find( 'li' ), selfSidebarItem,
					renderedSidebarCount = 0;

				selfSidebarItem = $sidebarItems.filter( function(){
					return $( this ).data( 'id' ) === self.params.sidebar_id;
				} );

				$sidebarItems.each( function() {
					var li = $( this ),
						sidebarId, sidebar, sidebarIsRendered;

					sidebarId = li.data( 'id' );
					sidebar = api.Widgets.registeredSidebars.get( sidebarId );
					sidebarIsRendered = sidebar.get( 'is_rendered' );

					li.toggle( sidebarIsRendered );

					if ( sidebarIsRendered ) {
						renderedSidebarCount += 1;
					}

					if ( li.hasClass( 'selected' ) && ! sidebarIsRendered ) {
						selectSidebarItem( selfSidebarItem );
					}
				} );

				if ( renderedSidebarCount > 1 ) {
					self.container.find( '.move-widget' ).show();
				} else {
					self.container.find( '.move-widget' ).hide();
				}
			};

			updateAvailableSidebars();
			api.Widgets.registeredSidebars.on( 'change:is_rendered', updateAvailableSidebars );

			/**
			 * Handle clicks for up/down/move on the reorder nav
			 */
			$reorderNav = this.container.find( '.widget-reorder-nav' );
			$reorderNav.find( '.move-widget, .move-widget-down, .move-widget-up' ).each( function() {
				$( this ).prepend( self.container.find( '.widget-title' ).text() + ': ' );
			} ).on( 'click keypress', function( event ) {
				if ( event.type === 'keypress' && ( event.which !== 13 && event.which !== 32 ) ) {
					return;
				}
				$( this ).focus();

				if ( $( this ).is( '.move-widget' ) ) {
					self.toggleWidgetMoveArea();
				} else {
					var isMoveDown = $( this ).is( '.move-widget-down' ),
						isMoveUp = $( this ).is( '.move-widget-up' ),
						i = self.getWidgetSidebarPosition();

					if ( ( isMoveUp && i === 0 ) || ( isMoveDown && i === self.getSidebarWidgetsControl().setting().length - 1 ) ) {
						return;
					}

					if ( isMoveUp ) {
						self.moveUp();
						wp.a11y.speak( l10n.widgetMovedUp );
					} else {
						self.moveDown();
						wp.a11y.speak( l10n.widgetMovedDown );
					}

					$( this ).focus(); // Re-focus after the container was moved.
				}
			} );

			/**
			 * Handle selecting a sidebar to move to
			 */
			this.container.find( '.widget-area-select' ).on( 'click keypress', 'li', function( event ) {
				if ( event.type === 'keypress' && ( event.which !== 13 && event.which !== 32 ) ) {
					return;
				}
				event.preventDefault();
				selectSidebarItem( $( this ) );
			} );

			/**
			 * Move widget to another sidebar
			 */
			this.container.find( '.move-widget-btn' ).click( function() {
				self.getSidebarWidgetsControl().toggleReordering( false );

				var oldSidebarId = self.params.sidebar_id,
					newSidebarId = self.container.find( '.widget-area-select li.selected' ).data( 'id' ),
					oldSidebarWidgetsSetting, newSidebarWidgetsSetting,
					oldSidebarWidgetIds, newSidebarWidgetIds, i;

				oldSidebarWidgetsSetting = api( 'sidebars_widgets[' + oldSidebarId + ']' );
				newSidebarWidgetsSetting = api( 'sidebars_widgets[' + newSidebarId + ']' );
				oldSidebarWidgetIds = Array.prototype.slice.call( oldSidebarWidgetsSetting() );
				newSidebarWidgetIds = Array.prototype.slice.call( newSidebarWidgetsSetting() );

				i = self.getWidgetSidebarPosition();
				oldSidebarWidgetIds.splice( i, 1 );
				newSidebarWidgetIds.push( self.params.widget_id );

				oldSidebarWidgetsSetting( oldSidebarWidgetIds );
				newSidebarWidgetsSetting( newSidebarWidgetIds );

				self.focus();
			} );
		},

		/**
		 * Highlight widgets in preview when interacted with in the Customizer
		 */
		_setupHighlightEffects: function() {
			var self = this;

			// Highlight whenever hovering or clicking over the form.
			this.container.on( 'mouseenter click', function() {
				self.setting.previewer.send( 'highlight-widget', self.params.widget_id );
			} );

			// Highlight when the setting is updated.
			this.setting.bind( function() {
				self.setting.previewer.send( 'highlight-widget', self.params.widget_id );
			} );
		},

		/**
		 * Set up event handlers for widget updating
		 */
		_setupUpdateUI: function() {
			var self = this, $widgetRoot, $widgetContent,
				$saveBtn, updateWidgetDebounced, formSyncHandler;

			$widgetRoot = this.container.find( '.widget:first' );
			$widgetContent = $widgetRoot.find( '.widget-content:first' );

			// Configure update button.
			$saveBtn = this.container.find( '.widget-control-save' );
			$saveBtn.val( l10n.saveBtnLabel );
			$saveBtn.attr( 'title', l10n.saveBtnTooltip );
			$saveBtn.removeClass( 'button-primary' );
			$saveBtn.on( 'click', function( e ) {
				e.preventDefault();
				self.updateWidget( { disable_form: true } ); // @todo disable_form is unused?
			} );

			updateWidgetDebounced = _.debounce( function() {
				self.updateWidget();
			}, 250 );

			// Trigger widget form update when hitting Enter within an input.
			$widgetContent.on( 'keydown', 'input', function( e ) {
				if ( 13 === e.which ) { // Enter.
					e.preventDefault();
					self.updateWidget( { ignoreActiveElement: true } );
				}
			} );

			// Handle widgets that support live previews.
			$widgetContent.on( 'change input propertychange', ':input', function( e ) {
				if ( ! self.liveUpdateMode ) {
					return;
				}
				if ( e.type === 'change' || ( this.checkValidity && this.checkValidity() ) ) {
					updateWidgetDebounced();
				}
			} );

			// Remove loading indicators when the setting is saved and the preview updates.
			this.setting.previewer.channel.bind( 'synced', function() {
				self.container.removeClass( 'previewer-loading' );
			} );

			api.previewer.bind( 'widget-updated', function( updatedWidgetId ) {
				if ( updatedWidgetId === self.params.widget_id ) {
					self.container.removeClass( 'previewer-loading' );
				}
			} );

			formSyncHandler = api.Widgets.formSyncHandlers[ this.params.widget_id_base ];
			if ( formSyncHandler ) {
				$( document ).on( 'widget-synced', function( e, widget ) {
					if ( $widgetRoot.is( widget ) ) {
						formSyncHandler.apply( document, arguments );
					}
				} );
			}
		},

		/**
		 * Update widget control to indicate whether it is currently rendered.
		 *
		 * Overrides api.Control.toggle()
		 *
		 * @since 4.1.0
		 *
		 * @param {boolean}   active
		 * @param {Object}    args
		 * @param {function}  args.completeCallback
		 */
		onChangeActive: function ( active, args ) {
			// Note:ssible'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'ble'bl