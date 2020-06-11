// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
export default {
  fromElasticsearch ({ rows, total }) {
    return {
      totalCount: total,
      nodes: rows
    }
  },

  fromScylla (rows) {
    return {
      totalCount: rows.length,
      nodes: rows
    }
  }
}
