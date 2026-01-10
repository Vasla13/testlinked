export const TYPES = {
    PERSON: 'person',
    GROUP: 'group',
    COMPANY: 'company'
};

export const KINDS = {
    PATRON: 'patron',
    EMPLOYE: 'employe',
    COLLEGUE: 'collegue',
    PARTENAIRE: 'partenaire',
    FAMILLE: 'famille',
    COUPLE: 'couple',
    AMOUR: 'amour',
    AMI: 'ami',
    ENNEMI: 'ennemi', // Invisible sur la carte, mais repousse
    RIVAL: 'rival',
    CONNAISSANCE: 'connaissance',
    AFFILIATION: 'affiliation',
    MEMBRE: 'membre',
    RELATION: 'relation'
};

export const PERSON_PERSON_KINDS = new Set([
    KINDS.FAMILLE, KINDS.COUPLE, KINDS.AMOUR, KINDS.AMI, 
    KINDS.ENNEMI, KINDS.RIVAL, KINDS.CONNAISSANCE, KINDS.COLLEGUE
]);

export const PERSON_ORG_KINDS = new Set([
    KINDS.PATRON, KINDS.EMPLOYE, KINDS.AFFILIATION, KINDS.MEMBRE,
    KINDS.PARTENAIRE, KINDS.ENNEMI 
]);

export const ORG_ORG_KINDS = new Set([
    KINDS.PARTENAIRE, KINDS.RIVAL, KINDS.ENNEMI, KINDS.AFFILIATION
]);

export const NODE_BASE_SIZE = { [TYPES.PERSON]: 12, [TYPES.COMPANY]: 25, [TYPES.GROUP]: 18 };
export const DEG_SCALE = { [TYPES.PERSON]: 3, [TYPES.COMPANY]: 1.5, [TYPES.GROUP]: 2 };
export const R_MIN = { [TYPES.PERSON]: 12, [TYPES.COMPANY]: 25, [TYPES.GROUP]: 18 };
export const R_MAX = { [TYPES.PERSON]: 50, [TYPES.COMPANY]: 100, [TYPES.GROUP]: 80 };

export const LINK_KIND_EMOJI = {
    [KINDS.PATRON]: '👑', [KINDS.EMPLOYE]: '💼', [KINDS.COLLEGUE]: '🤝',
    [KINDS.PARTENAIRE]: '🤝', [KINDS.FAMILLE]: '🏠', [KINDS.COUPLE]: '❤️',
    [KINDS.AMOUR]: '❤️', [KINDS.AMI]: '🍻', [KINDS.ENNEMI]: '⚔️',
    [KINDS.RIVAL]: '⚡', [KINDS.CONNAISSANCE]: '👋', [KINDS.AFFILIATION]: '🏴',
    [KINDS.MEMBRE]: '👤', [KINDS.RELATION]: '🔗'
};