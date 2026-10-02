export type SheetKind =
  | 'extras'
  | 'wicket'
  | 'more'
  | 'change_bowler'
  | 'retire'
  | 'penalty'
  | 'suspend'
  | 'revise'
  | 'end_innings'
  | 'decide_tie'
  | 'end_match'
  | 'add_batter'
  | 'add_bowler';

export type MatchRoute = 'score' | 'scorecard' | 'balls' | 'analytics' | 'manage';
