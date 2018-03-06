import Mousetrap from 'mousetrap';

import treeherderApp from '../treeherder_app';

treeherderApp.controller('MainCtrl', [
    '$scope', '$rootScope', '$location', '$timeout', '$q',
    'ThRepositoryModel', 'thPinboard', 'thTabs', '$document',
    'thClassificationTypes', 'thEvents', '$interval', '$window',
    'thJobFilters', 'ThResultSetStore',
    'thDefaultRepo', 'thJobNavSelectors', 'thTitleSuffixLimit', '$http',
    '$httpParamSerializer',
    function MainController(
        $scope, $rootScope, $location, $timeout, $q,
        ThRepositoryModel, thPinboard, thTabs, $document,
        thClassificationTypes, thEvents, $interval, $window,
        thJobFilters, ThResultSetStore,
        thDefaultRepo, thJobNavSelectors, thTitleSuffixLimit, $http,
        $httpParamSerializer) {

        /*
         *  revisionPollInterval: How often we check revision.txt for changes
         *  revisionPollDelayedInterval: Aggressively notify about revision changes after this delay
         */
        var revisionPollInterval = 1000 * 60 * 5;
        var revisionPollDelayedInterval = 1000 * 60 * 60;
        $rootScope.serverChanged = false;
        $rootScope.serverChangedDelayed = false;

        // Ensure user is available on initial page load
        $rootScope.user = {};

        // set to the default repo if one not specified
        const repoName = $location.search().repo;
        if (repoName) {
            $rootScope.repoName = repoName;
        } else {
            $rootScope.repoName = thDefaultRepo;
            $location.search("repo", $rootScope.repoName);
        }
        $rootScope.revision = $location.search().revision;
        thClassificationTypes.load();

        var checkServerRevision = function () {
            return $q(function (resolve, reject) {
                $http({
                    method: 'GET',
                    url: '/revision.txt'
                }).then(function successCallback(response) {
                    resolve(response.data);
                }, function errorCallback(response) {
                    reject("Error loading revision.txt: " + response.statusText);
                });
            });
        };

        $scope.updateButtonClick = function () {
            if (window.confirm("Reload the page to pick up Treeherder updates?")) {
                window.location.reload(true);
            }
        };

        // Only set up the revision polling interval if revision.txt exists on page load
        checkServerRevision().then(function (revision) {
            $rootScope.serverRev = revision;
            $interval(function () {
                checkServerRevision().then(function (revision) {
                    if ($rootScope.serverChanged) {
                        if (Date.now() - $rootScope.serverChangedTimestamp > revisionPollDelayedInterval) {
                            $rootScope.serverChangedDelayed = true;
                        }
                    }
                    // This request returns the treeherder git revision running on the server
                    // If this differs from the version chosen during the UI page load, show a warning
                    // Update $rootScope.serverRev so this warning is only shown once per server-side change
                    if ($rootScope.serverRev && $rootScope.serverRev !== revision) {
                        $rootScope.serverRev = revision;
                        if ($rootScope.serverChanged === false) {
                            $rootScope.serverChanged = true;
                            $rootScope.serverChangedTimestamp = Date.now();
                        }
                    }
                });
            }, revisionPollInterval);
        });

        var getSingleRevisionTitleString = function () {
            var revisions = [];
            var percentComplete;

            if ($scope.currentRepo && ThResultSetStore.getPushArray()[0]) {
                revisions = ThResultSetStore.getPushArray()[0].revisions;
            }

            // Revisions (and comments) might not be loaded the first few times this function is called
            if (revisions.length === 0 || !revisions[0].comments) {
                return [false, false];
            }

            //Job counts are calculated at a later point in the page load, so this is undefined for a while
            if (ThResultSetStore.getPushArray()[0].job_counts) {
                percentComplete = ThResultSetStore.getPushArray()[0].job_counts.percentComplete;
            }

            for (var i=0; i<revisions.length; i++) {
                var title = _.unescape(revisions[i].comments);

                /*
                 *  Strip out unwanted things like additional lines, trychooser
                 *  syntax, request flags, mq cruft, whitespace, and punctuation
                 */
                title = title.split("\n")[0];
                title = title.replace(/\btry: .*/, '');
                title = title.replace(/\b(r|sr|f|a)=.*/, '');
                title = title.replace(/(imported patch|\[mq\]:) /, '');
                title = title.replace(/[;,\-\. ]+$/, '').trim();
                if (title) {
                    if (title.length > thTitleSuffixLimit) {
                        title = title.substr(0, thTitleSuffixLimit - 3) + "...";
                    }
                    break;
                }
            }
            return [title, percentComplete];
        };

        $rootScope.getWindowTitle = function () {
            var ufc = $scope.getAllUnclassifiedFailureCount();
            var params = $location.search();

            // repoName is undefined for the first few title update attempts, show something sensible
            var title = "[" + ufc + "] " + ($rootScope.repoName ? $rootScope.repoName : "Treeherder");

            if (params.revision) {
                var desc = getSingleRevisionTitleString();
                var revtitle = desc[0] ? ": " + desc[0] : "";
                var percentage = desc[1] ? desc[1] + "% - " : "";

                title = percentage + title + revtitle;
            }
            return title;
        };

        $rootScope.closeJob = function () {
            // Setting the selectedJob to null closes the bottom panel
            $rootScope.selectedJob = null;

            // Clear the selected job display style
            $rootScope.$emit(thEvents.clearSelectedJob);

            // Reset selected job to null to initialize nav position
            ThResultSetStore.setSelectedJob();
        };

        $scope.repoModel = ThRepositoryModel;

        /**
         * The watched repos in the nav bar can be either on the left or the
         * right side of the screen and the drop-down menu may get cut off
         * if it pulls right while on the left side of the screen.
         * And it can change any time the user re-sizes the window, so we must
         * check this each time a drop-down is invoked.
         */
        $scope.setDropDownPull = function (event) {
            var element = event.target.offsetParent;
            if (element.offsetLeft > $(window).width() / 2) {
                $(element).find(".dropdown-menu").addClass("pull-right");
            } else {
                $(element).find(".dropdown-menu").removeClass("pull-right");
            }

        };

        $scope.getFilteredUnclassifiedFailureCount = ThResultSetStore.getFilteredUnclassifiedFailureCount;
        $scope.getAllUnclassifiedFailureCount = ThResultSetStore.getAllUnclassifiedFailureCount;

        $scope.toggleUnclassifiedFailures = thJobFilters.toggleUnclassifiedFailures;

        $scope.toggleInProgress = function () {
            thJobFilters.toggleInProgress();
        };

        $scope.getGroupState = function () {
            return $location.search().group_state || "collapsed";
        };

        $scope.groupState = $scope.getGroupState();

        $scope.toggleGroupState = function () {
            var newGroupState = $scope.groupState === "collapsed" ? "expanded" : null;
            $location.search("group_state", newGroupState);
        };

        /*
         * This updates which tier checkboxes are set according to the filters.
         * It's made slightly tricky due to the fact that, if you remove all
         * tier filters, it goes back to the default of showing only Tier 1
         * and 2, which then changes which boxes are checked.
         *
         * Initially I tried to do this with a call to ng-clicked on the
         * checkbox which called:
         *     thJobFilters.toggleFilters('tier', [tier], !$scope.isTierShowing(tier));
         *
         * However, that didn't update the checkboxes correctly when it went back to the
         * default of just tier 1 and 2 selected.  This had the a negative reaction
         * described in #2 from this comment: https://bugzilla.mozilla.org/show_bug.cgi?id=1231774#c5
         * It has to do with changing the value of a checkbox out from under it
         * when you've actually clicked that checkbox.
         *
         * This new solution uses a simple model scope object and update function
         * to keep things in sync.
         */

        $scope.isSingleTierSelected = function () {
            return _.without(_.values($scope.tiers), false).length === 1;
        };

        $scope.isTierShowing = function (tier) {
            return thJobFilters.isFilterSetToShow("tier", tier);
        };

        $scope.tiers = {};

        $scope.updateTiers = function () {
            // If any tier has changed, update the tier menu check boxes and
            // throw an event.
            var changed = false;
            thJobFilters.tiers.forEach(function (tier) {
                var isShowing = $scope.isTierShowing(tier);
                if (isShowing !== $scope.tiers[tier]) {
                    $scope.tiers[tier] = isShowing;
                    changed = true;
                }

            });
            if (changed) {
                $rootScope.$emit(thEvents.recalculateUnclassified);
            }
        };

        // Setup key event handling
        var stopOverrides = new Map();

        Mousetrap.stopCallback = function (ev, element, combo) {
            // if the element has the class "mousetrap" then no need to stop
            if (element.classList.contains('mousetrap')) {
                return false;
            }

            // If the bug filer is opened, don't let these shortcuts work
            if ($document[0].body.classList.contains("filer-open")) {
                return true;
            }
            var overrideFunc = stopOverrides.get(combo);
            if (overrideFunc) {
                var override = overrideFunc(ev, element, combo);
                if (override !== null) {
                    return override;
                }
            }
            if ((element.tagName === 'INPUT' &&
                 element.type !== "radio" && element.type !== "checkbox") ||
                element.tagName === 'SELECT' ||
                element.tagName === 'TEXTAREA' ||
                element.isContentEditable || ev.keyCode === 16) {
                return true;
            }
            return false;
        };

        var keyShortcuts = [
            // Shortcut: toggle display in-progress jobs (pending/running)
            ['i', function () {
                $scope.$evalAsync($scope.toggleInProgress());
            }],

            // Shortcut: select previous job
            ['left', function () {
                $rootScope.$emit(thEvents.changeSelection,
                                 'previous',
                                 thJobNavSelectors.ALL_JOBS);
            }],

            // Shortcut: select next job
            ['right', function () {
                $rootScope.$emit(thEvents.changeSelection,
                                 'next',
                                 thJobNavSelectors.ALL_JOBS);
            }],

            // Shortcut: select next unclassified failure
            ['n', function () {
                $rootScope.$emit(thEvents.changeSelection,
                                 'next',
                                 thJobNavSelectors.UNCLASSIFIED_FAILURES);
            }],

            // Shortcut: select previous unclassified failure
            ['p', function () {
                $rootScope.$emit(thEvents.changeSelection,
                                 'previous',
                                 thJobNavSelectors.UNCLASSIFIED_FAILURES);
            }],

            // Shortcut: select next job tab
            [['t'], function () {
                if ($scope.selectedJob) {
                    $scope.$evalAsync(
                        $rootScope.$emit(thEvents.selectNextTab)
                    );
                }
            }],

            // Shortcut: retrigger selected job
            ['r', function () {
                if ($scope.selectedJob) {
                    $scope.$evalAsync(
                        $rootScope.$emit(thEvents.jobRetrigger,
                                         $rootScope.selectedJob)
                    );
                }
            }],

            // Shortcut: pin selected job to pinboard
            ['space', function (ev) {
                // If a job is selected add it otherwise
                // let the browser handle the spacebar
                if ($scope.selectedJob) {
                    // Prevent page down propagating to the jobs panel
                    ev.preventDefault();

                    $scope.$evalAsync(
                        $rootScope.$emit(thEvents.jobPin, $rootScope.selectedJob)
                    );
                }
            }],

            // Shortcut: display only unclassified failures
            ['u', function () {
                $scope.$evalAsync($scope.toggleUnclassifiedFailures);
            }],

            // Shortcut: pin selected job to pinboard and add a related bug
            ['b', function (ev) {
                if ($scope.selectedJob) {
                    $rootScope.$emit(thEvents.addRelatedBug,
                                     $rootScope.selectedJob);

                    // Prevent shortcut key overflow during focus
                    ev.preventDefault();

                    $timeout(
                        function () {
                            $("#related-bug-input").focus();
                        }, 0);
                }
            }, function (ev, element) {
                if (element.id === "pinboard-classification-select") {
                    return false;
                }
                return null;
            }],

            // Shortcut: pin selected job to pinboard and enter classification
            ['c', function (ev) {
                if ($scope.selectedJob) {
                    $scope.$evalAsync(
                        $rootScope.$emit(thEvents.jobPin, $rootScope.selectedJob)
                    );

                    // Prevent shortcut key overflow during focus
                    ev.preventDefault();

                    $timeout(
                        function () {
                            $("#classification-comment").focus();
                        }, 0);
                }
            }, function (ev, element) {
                if (element.id === "pinboard-classification-select") {
                    return false;
                }
                return null;
            }],

            // Shortcut: enter a quick filter
            ['f', function (ev) {
                // Prevent shortcut key overflow during focus
                ev.preventDefault();

                $('#quick-filter').focus();
            }],

            // Shortcut: clear the quick filter field
            ['ctrl+shift+f', function (ev) {
                // Prevent shortcut key overflow during focus
                ev.preventDefault();

                $scope.$evalAsync($scope.clearFilterBox());
            }],

            // Shortcut: escape closes any open panels and clears selected job
            ['escape', function () {
                $scope.$evalAsync($scope.setSettingsPanelShowing(false));
                $scope.$evalAsync($scope.closeJob());
                $scope.$evalAsync($scope.setOnscreenShortcutsShowing(false));
            }],

            // Shortcut: clear the pinboard
            ['ctrl+shift+u', function () {
                $scope.$evalAsync($rootScope.$emit(thEvents.clearPinboard));
            }],

            // Shortcut: save pinboard classification and related bugs
            ['ctrl+enter', function () {
                $scope.$evalAsync($rootScope.$emit(thEvents.saveClassification));
            }, function () {
                // Make this work regardless of form controls etc.
                return false;
            }],

            // Shortcut: open the logviewer for the selected job
            ['l', function () {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyOpenLogViewer));
                } else if ($scope.selectedJob) {
                    $scope.$evalAsync($rootScope.$emit(thEvents.openLogviewer));
                }
            }],

            // Shortcut: delete classification and related bugs
            ['ctrl+backspace', function () {
                if ($scope.selectedJob) {
                    $scope.$evalAsync($rootScope.$emit(thEvents.deleteClassification));
                }
            }],

            // Shortcut: save all in the autoclasify panel
            ['s', function () {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifySaveAll));
                }
            }],

            // Shortcut: ignore selected in the autoclasify panel
            ['i', function () {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyIgnore));
                }
            }],

            // Shortcut: ignore selected in the autoclasify panel
            [['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'o'], function (ev) {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifySelectOption,
                                                       ev.key === "o" ? "manual" : ev.key));
                }
            }],

            // Shortcut: toggle edit mode for selected lines
            ['e', function () {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyToggleEdit));
                }
            }],

            // Shortcut: toggle more/fewer options in the autoclassify panel
            ['x', function () {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyToggleExpandOptions));
                }
            }],

            // Shortcut: select next unverified log line
            [['j', 'shift+j'], function (ev) {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyChangeSelection,
                                                       'next',
                                                       !ev.shiftKey));
                } else {
                    $rootScope.$emit(thEvents.changeSelection,
                                     'next',
                                     thJobNavSelectors.UNCLASSIFIED_FAILURES);
                }
            }],

            // Shortcut: select previous unverified log line
            [['k', 'shift+k'], function (ev) {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyChangeSelection,
                                                       'previous',
                                                       !ev.shiftKey));
                } else {
                    $rootScope.$emit(thEvents.changeSelection,
                                     'previous',
                                     thJobNavSelectors.UNCLASSIFIED_FAILURES);
                }
            }],

            // Shortcut: select all remaining unverified lines on the current job
            [['a'], function () {
                if (thTabs.selectedTab === "autoClassification") {
                    $scope.$evalAsync($rootScope.$emit(thEvents.autoclassifyChangeSelection,
                                                       'all_next',
                                                       false));
                }
            }],

            // Shortcut: display onscreen keyboard shortcuts
            ['?', function () {
                $scope.$evalAsync($scope.setOnscreenShortcutsShowing(true));
            }]
        ];

        keyShortcuts.forEach(function (data) {
            Mousetrap.bind(data[0], data[1]);
            if (data[2]) {
                var keys = data[0];
                if (!Array.isArray(keys)) {
                    keys = [keys];
                }
                keys.forEach(function (key) {
                    stopOverrides.set(key, data[2]);
                });
            }
        });

        $scope.updateTiers();

        // clicked a checkbox in the tier menu
        $scope.tierToggled = function (tier) {
            thJobFilters.toggleFilters('tier', [tier], $scope.tiers[tier]);
            $rootScope.$emit(thEvents.recalculateUnclassified);
        };

        var getNewReloadTriggerParams = function () {
            return _.pick(
                $location.search(),
                ThResultSetStore.reloadOnChangeParameters
            );
        };

        $scope.getFiltersForBar = function () {
            return [...thJobFilters.getNonFieldFiltersArray(), ...thJobFilters.getFieldFiltersArray()];
        };

        // field filters
        $scope.newFieldFilter = null;
        $scope.fieldFilters = [];
        $scope.fieldChoices = thJobFilters.getFieldChoices();

        $scope.toggleFieldFilterVisibility = function () {
            if ($scope.newFieldFilter === null) {
                $scope.newFieldFilter = { field: "", value: "" };
            }
            $scope.isFieldFilterVisible = !$scope.isFieldFilterVisible;
        };

        $scope.cancelNewFieldFilter = function () {
            $scope.newFieldFilter = null;
            $scope.isFieldFilterVisible = !$scope.isFieldFilterVisible;
        };

        // we have to set the field match type here so that the UI can either
        // show a text field for entering a value, or switch to a drop-down select.
        $scope.setFieldMatchType = function () {
            if ($scope.newFieldFilter.field) {
              $scope.newFieldFilter.matchType = $scope.fieldChoices[$scope.newFieldFilter.field].matchType;
              $scope.newFieldFilter.choices = $scope.fieldChoices[$scope.newFieldFilter.field].choices;
            }
        };

        // for most match types we want to show just the raw value.  But for
        // choice value type, we want to show the string representation of the
        // value.  For example, failure_classification_id is an int, but we
        // want to show the text.
        $scope.getFilterValue = function (field, value) {
            if ($scope.fieldChoices[field].matchType === 'choice' &&
                $scope.fieldChoices[field].choices[value]) {
                return $scope.fieldChoices[field].choices[value].name;
            }
            return value;
        };

        $scope.addNewFieldFilter = function () {
            if (!$scope.newFieldFilter) {
                return;
            }

            const { value, field } = $scope.newFieldFilter;

            if (field === "" || value === "") {
                return;
            }

            thJobFilters.addFilter(field, value);

            // Clear the values and close the input form group
            $scope.newFieldFilter = { field: "", value: "" };
            $scope.isFieldFilterVisible = !$scope.isFieldFilterVisible;
        };

        $scope.fromChangeValue = function () {
            let url = window.location.href;
            url = url.replace("&fromchange=" + $location.search().fromchange, "");
            return url;
        };

        $scope.toChangeValue = function () {
            let url = window.location.href;
            url = url.replace("&tochange=" + $location.search().tochange, "");
            return url;
        };

        $scope.cachedReloadTriggerParams = getNewReloadTriggerParams();

        // reload the page if certain params were changed in the URL.  For
        // others, such as filtering, just re-filter without reload.

        // the param ``skipNextPageReload`` will cause a single run through
        // this code to skip the page reloading even on a param that would
        // otherwise trigger a page reload.  This is useful for a param that
        // is being changed by code in a specific situation as opposed to when
        // the user manually edits the URL location bar.
        $rootScope.$on('$locationChangeSuccess', function () {

            // used to test for display of watched-repo-navbar
            $rootScope.locationPath = $location.path().replace('/', '');

            // used to avoid bad urls when the app redirects internally
            $rootScope.urlBasePath = $location.absUrl().split('?')[0];

            $scope.filterBarFilters = $scope.getFiltersForBar();

            var newReloadTriggerParams = getNewReloadTriggerParams();
            // if we are just setting the repo to the default because none was
            // set initially, then don't reload the page.
            var defaulting = newReloadTriggerParams.repo === thDefaultRepo &&
                             !$scope.cachedReloadTriggerParams.repo;

            if (!defaulting && $scope.cachedReloadTriggerParams &&
                !_.isEqual(newReloadTriggerParams, $scope.cachedReloadTriggerParams) &&
                !$rootScope.skipNextPageReload) {
                $window.location.reload();
            } else {
                $scope.cachedReloadTriggerParams = newReloadTriggerParams;
            }
            $rootScope.skipNextPageReload = false;

            // handle a change in the groupState whether it was by the button
            // or directly in the url.
            var newGroupState = $scope.getGroupState();
            if (newGroupState !== $scope.groupState) {
                $scope.groupState = newGroupState;
                $rootScope.$emit(thEvents.groupStateChanged, newGroupState);
            }

            // handle a change in the show duplicate jobs variable
            // whether it was by the button or directly in the url.
            var showDuplicateJobs = $scope.isShowDuplicateJobs();
            if (showDuplicateJobs !== $scope.showDuplicateJobs) {
                $scope.showDuplicateJobs = showDuplicateJobs;
                $rootScope.$emit(thEvents.duplicateJobsVisibilityChanged);
            }

            // update the tier drop-down menu if a tier setting was changed
            $scope.updateTiers();
        });

        $scope.changeRepo = function (repo_name) {
            // preserves filter params as the user changes repos and revisions
            $location.search(_.extend({
                repo: repo_name
            }, thJobFilters.getActiveFilters()));
        };

        $scope.filterParams = function () {
            var filters = $httpParamSerializer(thJobFilters.getActiveFilters());
            if (filters) {
                filters = "&" + filters;
            }
            return filters;
        };

        $scope.clearFilterBox = function () {
            thJobFilters.removeFilter("searchStr");
        };

        $scope.onscreenOverlayShowing = false;

        $scope.onscreenShortcutsShowing = false;
        $scope.setOnscreenShortcutsShowing = function (tf) {
            $scope.onscreenShortcutsShowing = tf;
            $scope.onscreenOverlayShowing = tf;
        };

        $scope.isSettingsPanelShowing = false;
        $scope.setSettingsPanelShowing = function (tf) {
            $scope.isSettingsPanelShowing = tf;
        };

        $scope.pinboardCount = thPinboard.count;
        $scope.pinnedJobs = thPinboard.pinnedJobs;
        $scope.jobFilters = thJobFilters;

        $scope.isShowDuplicateJobs = function () {
            return $location.search().duplicate_jobs === 'visible';
        };
        $scope.showDuplicateJobs = $scope.isShowDuplicateJobs();
        $scope.toggleShowDuplicateJobs = function () {
            var showDuplicateJobs = !$scope.showDuplicateJobs;

            // $scope.showDuplicateJobs will be changed in watch function above
            $location.search("duplicate_jobs", showDuplicateJobs ? 'visible' : null);
        };
    }
]);
