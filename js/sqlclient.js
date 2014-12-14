gandalf.createSqlClientModule = function(m, pubsub, fs, codeMirror, connection, settings, bookmarkModule, actions) {
  'use strict';
  var sqlEditor = function() {
      return function(element, isInitialized) {
        if (!isInitialized) {
          cm = codeMirror(element, {
            value: 'SELECT * FROM ',
            mode: 'text/x-sql',
            lineNumbers: true,
            autofocus: true,
            theme: 'gandalf',
            extraKeys: {
              'Ctrl-Enter': runQuery,
              'Ctrl-Space': assist,
              'Shift-Cmd-P': function () {
                pubsub.emit('actions-toggle-show');
              }
            }
          });
          var focus = cm.focus.bind(cm);
          pubsub.on('editor-focus', focus);
          pubsub.on('run-query', focus);
          pubsub.on('content-assist', assist);
        }
      };
    },
    runQuery = function() {
      var t = Date.now();
      errorMsg('');
      m.startComputation();
      metadata([]);
      data([]);
      status('executing...');
      m.endComputation();

      sqlStream = connection.execute(cm.getValue(' '));

      sqlStream.metadata(function(err, mData) {
        m.startComputation();
        if (err) {
          errorMsg(err.message);
        } else {
          metadata(mData);
        }
        m.endComputation();
      });

      sqlStream.next(function(err, dataBuffer, more) {
        m.startComputation();
        var time = Date.now() - t;
        if (err) {
          errorMsg(err.message);
        } else {
          data(data().concat(dataBuffer));
          isMore = more;
        }
        status('done, time: (' + time + ')');
        m.endComputation();
      });

    },
    columnWidth = function function_name(index) {
      if (metadata()[index] && metadata()[index].precision) {
        return Math.min(300, 12 + (metadata()[index].precision * 9));
      } else {
        return 300;
      }
    },
    scroll = function(e) {
      var element = e.target;
      if (element.scrollTop + element.clientHeight + 30 >= element.scrollHeight &&
        element.clientHeight < element.scrollHeight) {
        loadMore();
      }
    },
    loadMore = function() {
      if (!isMore) {
        return;
      }
      sqlStream.next(function(err, dataBuffer, more) {
        m.startComputation();
        if (err) {
          errorMsg(err.message);
        } else {
          data(data().concat(dataBuffer));
          isMore = more;
        }
        m.endComputation();
      });
    },
    assist = function() {
      cm.focus();
      codeMirror.showHint(cm, null, {
        tables: tables
      });
    },
    metadata = m.prop([]),
    data = m.prop([]),
    status = m.prop('connected!'),
    errorMsg = m.prop(''),
    isMore = false,
    tables = {},
    sqlStream, cm, connSettings;

  pubsub.on('run-query', runQuery);
  pubsub.on('bookmark-add', function () {
    bookmarkModule.show(cm.getSelection() || cm.getValue());
  });
  pubsub.on('schema-export', function () {
    connection.exportSchemaToFile({
      schema: connSettings.schema[0].name,
      file: connSettings.schema[0].file
    });
  });

  return {
    controller: function() {
      var connName = m.route.param('conn');
      connSettings = settings.connections.filter(function (c) {
        return c.name === connName;
      })[0];
      connSettings.schema.forEach(function (schema) {
        var t = Date.now();
        fs.readFile(schema.file, function  (err, schemaContent) {
          console.log('Load schema:', (Date.now() - t));
          if(err) {
            console.log(err);
          } else {
            JSON.parse(schemaContent).forEach(function (table) {
              tables[table.table] = table;
            });
          }
        });
      });
      status('Connected to ' + connSettings.name + '!');
    },
    view: function() {
      return [
        m('div', {
          config: sqlEditor(),
          'class': 'editor'
        }),
        m('div', {'class': 'result-gutter'}),
        m('div', {
          'class': 'result table'
        }, [
          m('div', {
            'class': 'error'
          }, errorMsg()),
          m('table', {
            'class': 'table-head'
          }, [
            m('tr', metadata().map(function(col, index) {
              return m('th', {
                style: 'width: ' + columnWidth(index) + 'px',
                title: col.name
              }, col.name);
            }))
          ]),
          m('div', {
            'class': 'table-body',
            onscroll: scroll
          }, [
            m('table', {
              'class': 'table-body-rows'
            }, data().map(function(row) {
              return m('tr', row.map(function(value, index) {
                return m('td', {
                  style: 'width: ' + columnWidth(index) + 'px'
                }, value);
              }));
            }))
          ])
        ]),
        m('div', {
          'class': 'statusbar'
        }, status()),
      actions.view(),
      bookmarkModule.view()
      ];
    }
  };
};
