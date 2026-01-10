export const TYPES = { PERSON: 'person', GROUP: 'group', COMPANY: 'company' };

export const KINDS = {
  AMOUR: 'amour', FAMILLE: 'famille', PARTENAIRE: 'partenaire', AMI: 'ami',
  PATRON: 'patron', HAUT_GRADE: 'haut_grade', EMPLOYE: 'employe', MEMBRE: 'membre',
  AFFILIATION: 'affiliation'
};

export const COLORS = {
  [KINDS.AMOUR]: '#ff6b81',
  [KINDS.FAMILLE]: '#ffd43b',
  [KINDS.PATRON]: '#ff922b',
  [KINDS.EMPLOYE]: '#20c997',
  [KINDS.MEMBRE]: '#e599f7',
  [KINDS.AMI]: '#4dabf7',
  // Ajoutez vos autres couleurs ici
  'default': '#5b6280'
};

export const PHYSICS_PARAMS = {
  FRICTION: 0.86,
  MAX_SPEED: 3.2,
  REPULSION: 520,
  LINK_DIST: 140
};