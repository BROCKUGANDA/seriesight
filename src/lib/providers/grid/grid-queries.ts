/**
 * GRID GraphQL queries.
 *
 * IMPORTANT (GRID_INTEGRATION.md): the exact field selections below follow the
 * documented shape of the Central Data / Series State products but MUST be
 * verified against the live schema of the active Open Access account before use.
 * The adapter validates every response and fails loudly on schema mismatch —
 * it never guesses. No secret or licensed payload is logged.
 */

export const CENTRAL_TITLES_QUERY = /* GraphQL */ `
  query Titles {
    titles {
      id
      name
    }
  }
`;

export const CENTRAL_TOURNAMENTS_QUERY = /* GraphQL */ `
  query Tournaments($titleId: ID!, $first: Int!, $after: String) {
    tournaments(titleId: $titleId, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        startDate
        endDate
      }
    }
  }
`;

export const CENTRAL_SERIES_QUERY = /* GraphQL */ `
  query Series($tournamentId: ID!, $first: Int!, $after: String) {
    tournament(id: $tournamentId) {
      series(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          scheduledStartTime
          teams {
            name
          }
        }
      }
    }
  }
`;

export const SERIES_STATE_QUERY = /* GraphQL */ `
  query SeriesState($seriesId: ID!) {
    seriesState(seriesId: $seriesId) {
      games {
        gameId
        gameNumber
        durationSeconds
        winnerSide
        picks {
          side
          championName
          participantName
          role
        }
        bans {
          side
          championName
          order
        }
        objectives {
          type
          timestampSeconds
          team
        }
      }
    }
  }
`;
