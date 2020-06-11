import DataLoader from 'dataloader';

export default {
  // https://github.com/graphql/dataloader/issues/158
  withContext(batchFunc, opts) {
    const store = new WeakMap();
    return function(ctx) {
      let loader = store.get(ctx);
      if (!loader) {
        console.log('new loader');
        loader = new DataLoader(keys => batchFunc(keys, ctx)
        , opts);
        store.set(ctx, loader);
      }
      return loader;
    };
  }
};
