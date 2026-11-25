export function normalizePlannerAvailability(raw,override){
 const value=raw?.available_minutes;
 return {available_minutes:Number.isFinite(value)&&value>=0?Math.round(value):null,
 workout:String(raw?.fixed_workout??raw?.workout??raw?.fixed_activity??raw?.activity??'').trim(),
 ...(override!==undefined?{available_minutes:override,localOnly:true}:{})};
}

export function isGroupRide(value){return /groep|group|clubrit|club ride|🚴|🚲/i.test(String(value??''));}

export function fixedGroupDates(availability,dates){return dates.filter(d=>isGroupRide(availability[d]?.workout));}

export function refreshFocus(plan,{discipline,limiter},recalculate){
 if(!plan)return null;
 if(plan.discipline===discipline&&plan.limiter===limiter)return plan;
 const analysis=plan.discipline!==discipline&&plan.limiterAnalysis?recalculate(plan.limiterAnalysis,discipline):plan.limiterAnalysis;
 return {...plan,discipline,limiter,limiterAnalysis:analysis};
}
