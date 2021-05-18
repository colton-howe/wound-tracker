Hooks.once('ready', () => {
  if(!game.modules.get('lib-wrapper')?.active && game.user.isGM)
      ui.notifications.error("Module Wound Tracker requires the 'libWrapper' module. Please install and activate it.");
});

// Map of actor to HP
const actorIdToHpMap = {};
const STATUS_PREFIX = "combat-utility-belt.wound-";
const Wound = {
  LEG: "leg",
  ARM: "arm",
  CHEST: "chest",
  HEAD: "head"
};

//Wrapper around Actor._handleUpdate to grab previous HP, since its not supplied in the updateActor hook
Hooks.on("init", () => {
  libWrapper.register("wound-tracker", 'Actor._handleUpdate', (wrapped, ...args) => {
    const {request, result = [], userId} = args[0];
    result.map((data) => {
      const entity = Actor.collection.get(data._id, {strict: true})
      if (entity && entity.data && entity.data.data && entity.data.data.attributes && entity.data.data.attributes.hp && entity.data.data.attributes.hp.value) {
        actorIdToHpMap[data._id] = entity.data.data.attributes.hp.value;
      } 
    });
    return wrapped({request, result, userId});
  }, "WRAPPER");
});

//When an actor is updated, use its previous HP and its new HP to send a message if we have wounds
Hooks.on("updateActor", (entity, entityChanges, options, userId) => {
  if (game.userId != userId || game.user.isGM) {
    return;
  }

  const changedActorData = entityChanges.data;

  if (changedActorData.attributes && changedActorData.attributes.hp && changedActorData.attributes.hp.value) {
    const actorData = entity.data.data;
    const actorMaxHp = actorData.attributes.hp.max;
    const actorPreviousHp = actorIdToHpMap[entity.data._id];

    const newActorHp = changedActorData.attributes.hp.value;
    const hpDiff = actorPreviousHp - newActorHp;
    if (hpDiff > 0 && actorMaxHp) {
      for (let i = 0; i < getNumberOfWounds(actorMaxHp, hpDiff); i++) {
        const woundDialog = new Dialog({
          title: "Wound Dialog",
          content: "<p>Where would you like to apply your wound?</p>",
          buttons: buildWoundButtonList(entity)
        });
        woundDialog.render(true);  
      }
    }
  }
});

const buildWoundButtonList = (actor) => {
  const legWounds = getMatchingWounds(actor, Wound.LEG);
  const armWounds = getMatchingWounds(actor, Wound.ARM);
  const chestWounds = getMatchingWounds(actor, Wound.CHEST);
  const headWounds = getMatchingWounds(actor, Wound.HEAD);

  const availableWounds = {};
  if (legWounds.length < 3) {
    availableWounds[Wound.LEG] = {
      label: "Leg",
      callback: () => applyWound(actor, Wound.LEG)
    };
  }

  if (armWounds.length < 3) {
    availableWounds[Wound.ARM] = {
      label: "Arm",
      callback: () => applyWound(actor, Wound.ARM)
    };
  }

  if (chestWounds.length < 3) {
    availableWounds[Wound.CHEST] = {
      label: "Chest",
      callback: () => applyWound(actor, Wound.CHEST)
    };
  }

  if (headWounds.length < 3) {
    availableWounds[Wound.HEAD] = {
      label: "Head",
      callback: () => applyWound(actor, Wound.HEAD)
    };
  }
  return availableWounds;
};

const applyWound = (actor, woundType) => {
  const woundTypeID = STATUS_PREFIX + woundType + "-";
  const typedWoundEffects = getMatchingWounds(actor, woundType);
  const woundKey = woundTypeID + (typedWoundEffects.length + 1);
  const matchingWoundStatus = CONFIG.statusEffects.find(status => status.id == woundKey);
  if (matchingWoundStatus) {
    ActiveEffect.create(matchingWoundStatus, actor).create();
  }
};

const getMatchingWounds = (actor, woundType) => {
  const woundTypeID = STATUS_PREFIX + woundType + "-";
  return actor.effects.filter(effect => {
    if (effect && effect.data && effect.data.flags && effect.data.flags.core && effect.data.flags.core.statusId != null) {
      return effect.data.flags.core.statusId.startsWith(woundTypeID);
    }

    return false;
  });
};

// Function to calculate the number of wounds inflicted based on damage dealt and max HP
const getNumberOfWounds = (maxHp, hpLoss) => {
  // The percentage of max HP that triggers a wound. Should be a float from 0 to 1.
  const woundThreshold = 0.25;
  if (maxHp == 0) {
    return 0;
  }

  return Math.floor(hpLoss/(maxHp*woundThreshold));
}