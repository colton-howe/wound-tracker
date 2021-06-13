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
const WoundDescription = {
  leg: {
    1: "-10ft Speed",
    2: "Half Speed",
    3: "0 Speed"
  },
  arm: {
    1: "-2 on Attacks",
    2: "Disadvantage on Attacks",
    3: "No two handed attacks or spells"
  },
  chest: {
    1: "-2 Str, Dex, Con Saves & Ability Checks",
    2: "Disadvantage on Saves & Ability Checks",
    3: "Gain 2 Exhasution Levels"
  },
  head: {
    1: "-2 Wis, Int, Cha Saves & Ability Checks",
    2: "Disadvantage on Concentration & Dex Checks",
    3: "U ded"
  }
};

//Wrapper around Actor._handleUpdate to grab previous HP, since its not supplied in the updateActor hook
Hooks.on("init", () => {
  libWrapper.register("wound-tracker", 'Actor._handleUpdate', (wrapped, ...args) => {
    const {request, result = [], userId} = args[0];
    result.map((data) => {
      const entity = Actor.collection.get(data._id, {strict: true})
      if (entity && entity.data && entity.data.data && entity.data.data.attributes && entity.data.data.attributes.hp && entity.data.data.attributes.hp.value != null) {
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

  if (changedActorData.attributes && changedActorData.attributes.hp && changedActorData.attributes.hp.value != null) {
    const actorData = entity.data.data;
    const actorMaxHp = actorData.attributes.hp.max;
    const actorPreviousHp = actorIdToHpMap[entity.data._id];

    const newActorHp = changedActorData.attributes.hp.value;
    const hpDiff = actorPreviousHp - newActorHp;
    if (hpDiff > 0 && actorMaxHp) {
      const numberOfWounds = getNumberOfWounds(actorMaxHp, hpDiff);
      let i = 0;
      showWoundDialogs(numberOfWounds, i, entity);
    }
  }
});

const showWoundDialogs = (totalWounds, currentWoundIndex, entity) => {
  if (currentWoundIndex < totalWounds) {
    const woundDialog = new Dialog({
      title: "Wound Dialog",
      content: "<p>Where would you like to apply your wound?</p>",
      buttons: buildWoundButtonList(entity),
      close: () => {
        setTimeout(() => {
          showWoundDialogs(totalWounds, ++currentWoundIndex, entity);
        }, 100)
      }
    });
    woundDialog.render(true);
  }
};

const buildWoundButtonList = (actor) => {
  const legWounds = getMatchingWounds(actor, Wound.LEG);
  const armWounds = getMatchingWounds(actor, Wound.ARM);
  const chestWounds = getMatchingWounds(actor, Wound.CHEST);
  const headWounds = getMatchingWounds(actor, Wound.HEAD);

  const availableWounds = {};
  if (legWounds.length < 3) {
    const currentLegWound = legWounds.length + 1;
    availableWounds[Wound.LEG] = {
      label: "Leg " + currentLegWound + getWoundDescription(Wound.LEG, currentLegWound),
      callback: () => applyWound(actor, Wound.LEG)
    };
  }

  if (armWounds.length < 3) {
    const currentArmWound = armWounds.length + 1;
    availableWounds[Wound.ARM] = {
      label: "Arm " + currentArmWound + getWoundDescription(Wound.ARM, currentArmWound),
      callback: () => applyWound(actor, Wound.ARM)
    };
  }

  if (chestWounds.length < 3) {
    const currentChestWound = chestWounds.length + 1;
    availableWounds[Wound.CHEST] = {
      label: "Chest " + currentChestWound + getWoundDescription(Wound.CHEST, currentChestWound),
      callback: () => applyWound(actor, Wound.CHEST)
    };
  }

  if (headWounds.length < 3) {
    const currentHeadWounds = headWounds.length + 1;
    availableWounds[Wound.HEAD] = {
      label: "Head " + currentHeadWounds + getWoundDescription(Wound.HEAD, currentHeadWounds),
      callback: () => applyWound(actor, Wound.HEAD)
    };
  }
  return availableWounds;
};

const getWoundDescription = (woundName, woundCount) => {
  return " (" + WoundDescription[woundName][woundCount] + ")";
}

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