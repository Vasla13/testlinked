export const TYPES = { PERSON: 'person', GROUP: 'group', COMPANY: 'company' };

export const KINDS = {
    AMOUR: 'amour', FAMILLE: 'famille', PARTENAIRE: 'partenaire', AMI: 'ami',
    PATRON: 'patron', HAUT_GRADE: 'haut_grade', EMPLOYE: 'employe', MEMBRE: 'membre',
    AFFILIATION: 'affiliation'
};

export const ORG_REL = new Set([KINDS.PATRON, KINDS.HAUT_GRADE, KINDS.EMPLOYE, KINDS.MEMBRE]);
export const PERSON_PERSON_KINDS = new Set([KINDS.AMOUR, KINDS.AMI, KINDS.FAMILLE, KINDS.PARTENAIRE]);
export const PERSON_ORG_KINDS = new Set([KINDS.PATRON, KINDS.HAUT_GRADE, KINDS.EMPLOYE, KINDS.MEMBRE, KINDS.AFFILIATION]);
export const ORG_ORG_KINDS = new Set([KINDS.AFFILIATION]);

export const NODE_BASE_SIZE = { [TYPES.PERSON]: 10, [TYPES.GROUP]: 20, [TYPES.COMPANY]: 22 };
export const DEG_SCALE = { [TYPES.PERSON]: 3.5, [TYPES.GROUP]: 5.0, [TYPES.COMPANY]: 5.5 };
export const R_MIN = { [TYPES.PERSON]: 10, [TYPES.GROUP]: 20, [TYPES.COMPANY]: 22 };
export const R_MAX = { [TYPES.PERSON]: 48, [TYPES.GROUP]: 72, [TYPES.COMPANY]: 80 };

export const LINK_KIND_EMOJI = {
    [KINDS.AMOUR]: '❤️', [KINDS.FAMILLE]: '👪', [KINDS.PARTENAIRE]: '🤝', [KINDS.AMI]: '🤝',
    [KINDS.PATRON]: '👑', [KINDS.HAUT_GRADE]: '🏅', [KINDS.EMPLOYE]: '💼', [KINDS.MEMBRE]: '🎫',
    [KINDS.AFFILIATION]: '🔗'
};

export const LINK_KIND_COLOR = {
    [KINDS.AMOUR]: '#ff6b81', [KINDS.FAMILLE]: '#ffd43b', [KINDS.PARTENAIRE]: '#b197fc',
    [KINDS.AMI]: '#4dabf7', [KINDS.PATRON]: '#ff922b', [KINDS.HAUT_GRADE]: '#fab005',
    [KINDS.EMPLOYE]: '#20c997', [KINDS.MEMBRE]: '#15aabf', [KINDS.AFFILIATION]: '#94d82d'
};