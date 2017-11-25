import { getSettings } from './modules/get_settings'
import { connect } from './modules/connect'
import { getTables } from './modules/get_tables'
import { getHistoryModel } from './modules/history'
import { createSplitter } from './views/splitter'
const { ipcRenderer, remote } = require('electron');
const m = require('mithril');
const CodeMirror = require('codemirror');
require('codemirror/addon/hint/show-hint.js');
require('codemirror/addon/search/searchcursor.js');
require('codemirror/addon/dialog/dialog.js');
require('codemirror/keymap/sublime.js');
require('codemirror/mode/sql/sql.js');
require('./modules/sql-hint.js')

getSettings(process.env.HOME).then(function (settings) {
  const fs = require('fs'),
    events = require('events'),
    { createErrorHandler } = require('./views/errorhandler'),
    { createLoginModule } = require('./views/login'),
    { createActions } = require('./views/actions'),
    { createPopupmenu } = require('./views/popupmenu'),
    { createStatusbar } = require('./views/statusbar'),
    { createEditor } = require('./views/editor'),
    { createResult } = require('./views/result'),
    { createBookmarkModel } = require('./views/bookmark'),
    { createHistoryView } = require('./views/history'),
    { createColumnsPrompt } = require('./views/columns_prompt'),
    { createExecuter } = require('./modules/executer'),
    { createSchemaHandler } = require('./modules/schema'),
    { createSqlHint } = require('./modules/sql-hint');
  const splitter = createSplitter(m);
  
  var pubsub = new events.EventEmitter(),
    errorHandler = createErrorHandler(m),
    loginModule = createLoginModule(m, pubsub, connect, settings),
    actions = createActions(m, pubsub, createPopupmenu),
    statusbar = createStatusbar(m, pubsub),
    editor = createEditor(m, pubsub, CodeMirror, fs),
    result = createResult(m, pubsub),
    bookmarkModule = createBookmarkModel(m, fs, pubsub, editor, createPopupmenu),
    historyModule = createHistoryView(m, pubsub, createPopupmenu, getHistoryModel),
    columnsPrompt = createColumnsPrompt(m, editor, getTables, pubsub, createPopupmenu),
    connected = false;


  window.addEventListener('beforeunload', function () {
    pubsub.emit('disconnect');
  }, false);

  createExecuter(pubsub, editor, m);
  createSchemaHandler(fs, pubsub);
  createSqlHint(pubsub, editor, getTables, CodeMirror);

  pubsub.on('new-window', () => {
    console.log('emit new-window');
    ipcRenderer.send('new-window');
  });

  pubsub.on('connected', function (connection) {
    const settingsStyle = document.getElementById('settings-style');
    const primaryColor = connection.settings().primaryColor || '#e35f28';
    if (settingsStyle) {
      settingsStyle.textContent = '.table-head th { color: ' +
        primaryColor +
        '} .cm-s-gandalf span.cm-keyword { color: ' +
        primaryColor +
        '} .p-menu-item-selected {background-color: ' +
        primaryColor +
        '} .CodeMirror-hint-active {background-color: ' +
        primaryColor +
        '}';

    }

    connected = true;
    document.title = 'Gandalf - connected to ' + connection.settings().name;
    m.route('/sql/' + connection.settings().name);
  });

  var sqlModule = {
    controller: function () {
      var connName = m.route.param('conn')
      if (!connected && connName) {
        const connSettings = settings.connections.find((c) => c.name === connName)
        if (connSettings.host === 'hsql:inmemory') {
          console.log('reconnect to hsql:inmemory!!');
          connect({ host: connSettings.host }, connSettings).then(function (connection) {
            pubsub.emit('connected', connection);
          });
        } else {
          pubsub.emit('login');
        }
      }
    },
    view: function () {
      return [
        editor.view(),
        splitter(),
        loginModule.view(),
        result.view(),
        statusbar.view(),
        actions.view(),
        bookmarkModule.view(),
        historyModule.view(),
        columnsPrompt.view(),
        errorHandler.view()
      ];
    }
  };

  m.route(document.getElementById('body'), '/sql/' + (remote.getGlobal('sharedObject').dev ? 'hsql inmemory dev' : ''), {
    '/sql': sqlModule,
    '/sql/:conn': sqlModule
  });
}).catch(function (err) {
  console.error('startup error', err.message, err.stack);
});