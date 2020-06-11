module.exports = {
  fromElasticsearch: ({rows, total}) ->
    {
      totalCount: total
      nodes: rows
    }

  fromScylla: (rows) ->
    {
      totalCount: rows.length
      nodes: rows
    }
}
