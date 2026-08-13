exports.activate = () => ({
  connectionSharing: {
    getActiveEditorConnectionId: async () => undefined,
    getActiveDatabase: async () => undefined,
    getDatabaseForConnectionId: async () => undefined,
    connect: async () => undefined,
    disconnect: () => undefined,
    isConnected: () => false,
    executeSimpleQuery: async () => ({ rowCount: 0, rows: [] }),
    listDatabases: async () => [],
  },
});
