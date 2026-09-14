/*
 * Liljegren WBGT reference oracle for Muggy's test fixtures.
 *
 * This driver links against wbgt.c.original, the unmodified Argonne source
 * (Copyright (c) 2008, UChicago Argonne, LLC; see that file for the licence,
 * conditions and disclaimer, which apply to this derivative work).
 *
 * "This product includes software produced by UChicago Argonne, LLC
 *  under Contract No. DE-AC02-06CH11357 with the Department of Energy."
 *
 * MODIFICATIONS (licence condition 1)
 *   2026-09-13  Okan Erturan, Muggy (muggy.fyi)
 *   - wbgt.c.original is compiled as-is; only its demonstration main() is
 *     renamed at compile time (-Dmain=liljegren_demo_main) so this driver
 *     can supply its own.
 *   - For rows with fdir = -1 the driver calls the original calc_wbgt()
 *     unchanged.
 *   - For rows with fdir >= 0 (or -2) it performs the same steps as
 *     calc_wbgt(), in the same order and with the same float types, except
 *     that a caller-supplied direct-beam fraction replaces the estimate
 *     wherever calc_solar_parameters() would have produced one. fdir = -2
 *     keeps the estimate, so verify.sh can prove the restatement is exact.
 *
 * Input (stdin, CSV, no header), one case per line:
 *   id,year,month,day,hour,minute,gmt,avg,lat,lon,solar,pres,tair,rh,
 *   speed,zspeed,dT,urban,fdir
 * Output (stdout, CSV with header):
 *   id,status,Tg,Tnwb,Tpsy,Twbg,est_speed,cza,fdir,solar
 */

#include <stdio.h>

/* The original uses K&R definitions. Declaring them without prototypes
 * makes this file promote float arguments exactly as the original's own
 * callers do. */
int calc_wbgt();
int calc_solar_parameters();
float Tglobe();
float Twb();
float est_wind_speed();
int stab_srdt();

#define REF_HEIGHT 2.0
#define CZA_MIN 0.00873

static int restated_wbgt(int year, int month, int day, int hour, int minute,
                         int gmt, int avg, float lat, float lon, float solar,
                         float pres, float Tair, float relhum, float speed,
                         float zspeed, float dT, int urban, double fdir_in,
                         float *est_speed, float *Tg, float *Tnwb, float *Tpsy,
                         float *Twbg, float *cza_out, float *fdir_out,
                         float *solar_out)
{
	float cza, fdir, tk, rh;
	double hour_gmt, dday;
	int daytime, stability_class;

	hour_gmt = hour - gmt + (minute - 0.5 * avg) / 60.;
	dday = day + hour_gmt / 24.;
	calc_solar_parameters(year, month, dday, lat, lon, &solar, &cza, &fdir);
	/* The original estimates fdir only when the top-of-atmosphere
	 * irradiance and the normalised irradiance are both positive, which is
	 * exactly when cza >= CZA_MIN and the adjusted solar > 0. */
	if (fdir_in >= 0. && cza >= CZA_MIN && solar > 0.)
		fdir = (float)fdir_in;

	*est_speed = speed;
	if (zspeed != REF_HEIGHT) {
		daytime = cza > 0. ? 1 : 0;
		stability_class = stab_srdt(daytime, speed, solar, dT);
		*est_speed = est_wind_speed(speed, zspeed, stability_class, urban);
		speed = *est_speed;
	}
	tk = Tair + 273.15;
	rh = 0.01 * relhum;
	*Tg = Tglobe(tk, rh, pres, speed, solar, fdir, cza);
	*Tnwb = Twb(tk, rh, pres, speed, solar, fdir, cza, 1);
	*Tpsy = Twb(tk, rh, pres, speed, solar, fdir, cza, 0);
	*Twbg = 0.1 * Tair + 0.2 * (*Tg) + 0.7 * (*Tnwb);
	*cza_out = cza;
	*fdir_out = fdir;
	*solar_out = solar;
	if (*Tg == -9999 || *Tnwb == -9999) {
		*Twbg = -9999;
		return -1;
	}
	return 0;
}

int main(void)
{
	char line[1024];
	printf("id,status,Tg,Tnwb,Tpsy,Twbg,est_speed,cza,fdir,solar\n");
	while (fgets(line, sizeof line, stdin)) {
		long id;
		int year, month, day, hour, minute, gmt, avg, urban, status;
		double lat, lon, solar, pres, tair, rh, speed, zspeed, dT, fdir_in;
		float est_speed, Tg, Tnwb, Tpsy, Twbg, cza = 0, fdir = 0, solar_used;

		if (sscanf(line, "%ld,%d,%d,%d,%d,%d,%d,%d,%lf,%lf,%lf,%lf,%lf,%lf,%lf,%lf,%lf,%d,%lf",
		           &id, &year, &month, &day, &hour, &minute, &gmt, &avg, &lat, &lon,
		           &solar, &pres, &tair, &rh, &speed, &zspeed, &dT, &urban, &fdir_in) != 19)
			continue;

		if (fdir_in == -1.) {
			est_speed = (float)speed;
			status = calc_wbgt(year, month, day, hour, minute, gmt, avg,
			                   (float)lat, (float)lon, (float)solar, (float)pres,
			                   (float)tair, (float)rh, (float)speed, (float)zspeed,
			                   (float)dT, urban, &est_speed, &Tg, &Tnwb, &Tpsy, &Twbg);
			/* calc_wbgt does not expose these; recompute for the record. */
			solar_used = (float)solar;
			{
				double hour_gmt = hour - gmt + (minute - 0.5 * avg) / 60.;
				calc_solar_parameters(year, month, day + hour_gmt / 24., (float)lat,
				                      (float)lon, &solar_used, &cza, &fdir);
			}
		} else {
			status = restated_wbgt(year, month, day, hour, minute, gmt, avg,
			                       (float)lat, (float)lon, (float)solar, (float)pres,
			                       (float)tair, (float)rh, (float)speed, (float)zspeed,
			                       (float)dT, urban, fdir_in, &est_speed, &Tg, &Tnwb,
			                       &Tpsy, &Twbg, &cza, &fdir, &solar_used);
		}
		printf("%ld,%d,%.4f,%.4f,%.4f,%.4f,%.4f,%.6f,%.6f,%.4f\n", id, status,
		       Tg, Tnwb, Tpsy, Twbg, est_speed, cza, fdir, solar_used);
	}
	return 0;
}
